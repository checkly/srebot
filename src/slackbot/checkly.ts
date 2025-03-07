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
import { generateHeatmapPNG } from "../heatmap/createHeatmap";
import { createCheckBlock } from "./blocks/checkBlock";
import { log } from "../log";
import { App, StringIndexed } from "@slack/bolt";
import { readCheck } from "../db/check";
import { findErrorClustersForCheck } from "../db/error-cluster";
import { findCheckResults } from "../db/check-results";
import { readCheckGroup } from "../db/check-groups";

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

  const heatmapImage = generateHeatmapPNG(checkResults, {
    bucketSizeInMinutes: check.frequency * 10,
    verticalSeries: check.locations.length,
  });

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

  const interval = last24h(new Date());

  const checkResults = await findCheckResults(
    check.id,
    interval.from,
    interval.to,
  );

  const runLocations = checkResults.reduce((acc, cr) => {
    acc.add(cr.runLocation);
    return acc;
  }, new Set<string>());

  const failingCheckResults = checkResults.filter(
    (result) => result.hasFailures || result.hasErrors,
  );

  const failureClusters = await findErrorClustersForCheck(check.id);
  const errorGroups = failureClusters.map((fc) => {
    return {
      error_message: fc.error_message,
      error_count: -1,
      locations: [],
    };
  });

  const heatmapImage = generateHeatmapPNG(checkResults, {
    bucketSizeInMinutes: 30,
    verticalSeries: runLocations.size,
  });

  log.info(
    {
      checkId,
      checkResultCount: checkResults.length,
      failingCheckResultCount: failingCheckResults.length,
      duration: Date.now() - start,
    },
    "checkSummary",
  );
  const message = createCheckBlock({
    check,
    failureCount: failingCheckResults.length,
    errorGroups,
    checkResults,
    frequency: check.frequency || -1,
    locations: Array.from(runLocations),
  });

  return { message, image: heatmapImage };
}
export const CHECKLY_COMMAND_NAME = "/checkly";

export const checklyCommandHandler = (app: App<StringIndexed>) => {
  return async ({ ack, respond, command }) => {
    await ack();

    const args = command.text.split(" ");
    if (args.length === 1 && !!args[0]) {
      const { message, image } = await checkSummary(args[0]);
      await respond({
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
        ...message,
      });
    } else {
      await respond({
        text: "Please provide either a check ID or both a check ID and check result ID in the format: /checkly <check_id> (<check_result_id>)",
      });
    }
  };
};
