import { generateObject, generateText } from "ai";
import { checkly } from "../checkly/client";
import {
  analyseCheckFailureHeatMap,
  summarizeErrorsPrompt,
  SummarizeErrorsPromptType,
  summarizeTestGoalPrompt,
} from "../prompts/checkly";
import {
  fetchCheckResults,
  last24h,
  summarizeCheckResult,
} from "../prompts/checkly-data";
import { createCheckResultBlock } from "./blocks/checkResultBlock";
import { generateHeatmapPNG } from "../heatmap/createHeatmap";
import { log } from "../log";
import { App, StringIndexed } from "@slack/bolt";
import { readCheck } from "../db/check";
import { findErrorClustersForCheck } from "../db/error-cluster";
import { findCheckResults } from "../db/check-results";
import { readCheckGroup } from "../db/check-groups";
import generateCheckSummaryBlock from "./blocks/newCheckSummaryBlock";
import { analyseMultipleChecks } from "../use-cases/analyse-multiple/analyse-multiple-checks";
import { createMultipleCheckAnalysisBlock } from "./blocks/multipleChecksAnalysisBlock";

async function checkResultSummary(checkId: string, checkResultId: string) {
  const start = Date.now();
  const check = await checkly.getCheck(checkId);
  if (check.groupId) {
    const checkGroup = await checkly.getCheckGroup(check.groupId);
    check.locations = checkGroup.locations;
  }

  const checkAppUrl = checkly.getCheckUrl(check.id);
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

  const heatmapImage = generateHeatmapPNG(
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

async function checkSummary(checkId: string) {
  const start = Date.now();
  const check = await readCheck(checkId);
  if (check.groupId) {
    const checkGroup = await readCheckGroup(BigInt(check.groupId));
    check.locations = checkGroup.locations;
  }

  const prompt = summarizeTestGoalPrompt(
    check.name,
    check.script || "",
    check.scriptPath || "",
    [],
  );
  const { text: checkSummary } = await generateText(prompt);

  const interval = last24h(new Date());

  const startedAt = Date.now();
  const checkResults = await findCheckResults(
    check.id,
    interval.from,
    interval.to,
  );
  log.debug(
    {
      checkResultsLength: checkResults.length,
      durationMs: Date.now() - startedAt,
      checkId,
    },
    "Fetched check results",
  );

  const runLocations = checkResults.reduce((acc, cr) => {
    acc.add(cr.runLocation);
    return acc;
  }, new Set<string>());

  const failingCheckResults = checkResults.filter(
    (result) => result.hasFailures || result.hasErrors,
  );

  const failureClusters = await findErrorClustersForCheck(check.id);
  const failurePatterns = failureClusters.map((fc) => fc.error_message);

  const mostRecentFailureCheckResult = failingCheckResults.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )[0];
  const lastFailure =
    failingCheckResults.length > 0
      ? mostRecentFailureCheckResult.startedAt
      : checkResults[0].startedAt;

  const successRate = Math.round(
    ((checkResults.length - failingCheckResults.length) / checkResults.length) *
      100,
  );

  const heatmapImage = generateHeatmapPNG(
    checkResults,
    interval.from,
    interval.to,
    {
      bucketSizeInMinutes: 30,
      verticalSeries: runLocations.size,
    },
  );
  const heatmapPromptResult = await generateObject(
    analyseCheckFailureHeatMap(heatmapImage),
  );
  const checkCategory = heatmapPromptResult.object.category;

  log.info(
    {
      checkId,
      checkResultCount: checkResults.length,
      failingCheckResultCount: failingCheckResults.length,
      duration: Date.now() - start,
    },
    "checkSummary",
  );
  const message = generateCheckSummaryBlock({
    checkId,
    checkName: check.name,
    checkSummary: checkSummary,
    checkState: checkCategory,
    lastFailure: new Date(lastFailure),
    successRate,
    failureCount: failingCheckResults.length,
    lastFailureId: mostRecentFailureCheckResult?.id,
    timeLocationSummary: heatmapPromptResult.object.failureIncidentsSummary,
    failurePatterns,
  });

  return { message, image: heatmapImage };
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
    log.info({ args }, "Command received");

    if (args.length <= 1 && !getIsUUID(args[0])) {
      const multipleCheckAnalysisResult = await analyseMultipleChecks(args[0]);
      await respond({
        ...createMultipleCheckAnalysisBlock(multipleCheckAnalysisResult),
        response_type: "in_channel",
      });
    } else if (args.length === 1 && !!args[0] && getIsUUID(args[0])) {
      const { message, image } = await checkSummary(args[0]);
      await respond({
        response_type: "in_channel",
        ...message,
      });

      if (image) {
        await app.client.files.uploadV2({
          channel_id: command.channel_id,
          file: image,
          filename: "CheckResultHeatmap.png",
          title: "Check Results Heatmap",
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
          filename: "CheckResultHeatmap.png",
          title: "Check Results Heatmap",
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
