import { generateObject } from "ai";
import { checkly } from "../checkly/client";
import {
  summarizeErrorsPrompt,
  SummarizeErrorsPromptType,
} from "../prompts/checkly";
import {
  fetchCheckResults,
  last24h,
  summarizeCheckResult,
} from "../prompts/checkly-data";
import { createCheckResultBlock } from "./blocks/checkResultBlock";
import { log } from "../log";
import { App, StringIndexed } from "@slack/bolt";
import { analyseMultipleChecks } from "../use-cases/analyse-multiple/analyse-multiple-checks";
import { createMultipleCheckAnalysisBlock } from "./blocks/multipleChecksAnalysisBlock";
import { generateHeatmap } from "../heatmap/generateHeatmap";
import { accountSummary } from "./accountSummaryCommandHandler";
import { checkSummary } from "./commands/check-summary";
import { interval } from "date-fns";

async function checkResultSummary(checkId: string, checkResultId: string) {
  const start = Date.now();
  const check = await checkly.getCheck(checkId);
  if (check.groupId) {
    const checkGroup = await checkly.getCheckGroup(check.groupId);
    check.locations = checkGroup.locations;
  }

  const checkAppUrl = checkly.getCheckAppUrl(check.id);
  const checkResult = await checkly.getCheckResult(check.id, checkResultId);
  const checkResultAppUrl = checkly.getCheckResultAppUrl(
    check.id,
    checkResult.id,
  );

  const interval = last24h(new Date(checkResult.startedAt));

  const checkResults = await fetchCheckResults(checkly, {
    checkId: check.id,
    ...interval,
  });

  const failingCheckResults = checkResults.filter(
    (result) => result.hasFailures || result.hasErrors,
  );

  const promptDef = summarizeErrorsPrompt({
    check: check.id,
    locations: check.locations,
    frequency: check.frequency,
    interval,
    results: [...failingCheckResults, checkResult].map(summarizeCheckResult),
  });
  const { object: errorGroups } =
    await generateObject<SummarizeErrorsPromptType>(promptDef);

  const heatmapImage = generateHeatmap(
    checkResults,
    interval.from,
    interval.to,
    {
      bucketSizeInMinutes: check.frequency * 10,
      verticalSeries: check.locations.length,
    },
  );

  log.info(
    {
      checkId,
      checkResultId,
      checkResultCount: checkResults.length,
      failingCheckResultCount: failingCheckResults.length,
      duration: Date.now() - start,
    },
    "checkResultSummary",
  );
  return {
    message: createCheckResultBlock({
      check,
      checkAppUrl,
      checkResult,
      checkResultAppUrl,
      errorGroups,
      failingCheckResults,
      intervalStart: interval.from,
    }),
    image: heatmapImage,
  };
}

// Allow overriding the command name for local dev
export const CHECKLY_COMMAND_NAME =
  process.env.CHECKLY_COMMAND_NAME_OVERRIDE || "/checkly";

const getIsUUID = (str: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    str,
  );
};

export const checklyCommandHandler = (app: App<StringIndexed>) => {
  return async ({ ack, respond, command }) => {
    await ack();
    const args = command.text.split(" ");
    if (args.length == 1 && args[0].trim() === "") {
      const accountId = process.env.CHECKLY_ACCOUNT_ID!;
      const account = await checkly.getAccount(accountId);
      const interval = last24h(new Date());

      await respond({
        response_type: "ephemeral",
        text: `Analysing account "${account.name}"... ⏳`,
      });

      try {
        const { message } = await accountSummary(accountId, interval);
        await respond({
          response_type: "in_channel",
          ...message,
        });
      } catch (err) {
        // Ensure we have a proper Error object
        const error = err instanceof Error ? err : new Error(String(err));

        log.error(
          {
            err: error,
            accountId,
          },
          "Error fetching account summary",
        );

        await respond({
          replace_original: true,
          text: `:x: Error fetching account summary: ${error.message}`,
        });
      }
    } else if (args.length == 1 && !getIsUUID(args[0])) {
      const multipleCheckAnalysisResult = await analyseMultipleChecks(args[0]);
      await respond({
        ...createMultipleCheckAnalysisBlock(multipleCheckAnalysisResult),
        response_type: "in_channel",
      });
    } else if (args.length === 1 && !!args[0] && getIsUUID(args[0])) {
      const checkId = args[0];
      try {
        await respond({
          response_type: "ephemeral",
          text: `Analysing check \`${checkId}\`... ⏳`,
        });

        const { message, image } = await checkSummary(checkId);

        await respond({
          response_type: "in_channel",
          ...message,
        });

        if (image) {
          await app.client.files.uploadV2({
            channel_id: command.channel_id,
            file: image,
            filename: "CheckResultsPerLocation.png",
            title: "Check Results per Location",
          });
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log.error(
          {
            err: error,
            checkId,
          },
          "Error preparing check summary",
        );

        await respond({
          replace_original: true,
          text: `:x: Error analysing check summary: ${error.message}`,
        });
      }

      // FIXME find a way to send the image to slack (al)
    } else if (args.length === 2) {
      const [checkId, checkResultId] = args;
      const { message, image } = await checkResultSummary(
        checkId,
        checkResultId,
      );

      if (image) {
        await app.client.files.uploadV2({
          channel_id: command.channel_id,
          file: image,
          filename: "CheckResultsPerLocation.png",
          title: "Check Results per Location",
        });
      }

      await respond({
        response_type: "in_channel",
        ...message,
      });
    } else {
      await respond({
        text: "Please provide either a check ID or both a check ID and check result ID in the format: /checkly <check_id> (<check_result_id>)",
      });
    }
  };
};
