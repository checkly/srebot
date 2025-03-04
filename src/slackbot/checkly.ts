import { generateObject } from "ai";
import { checkly } from "../checkly/client";
import {
  summarizeErrorsPrompt,
  SummarizeErrorsPromptType,
} from "../prompts/checkly";
import {
  fetchCheckResults,
  last24h,
  LAST_30_DAYS,
  summarizeCheckResult,
} from "../prompts/checkly-data";
import { createCheckResultBlock } from "./blocks/checkResultBlock";
import { generateHeatmapPNG } from "../heatmap/createHeatmap";
import { createCheckBlock } from "./blocks/checkBlock";

async function checkResultSummary(checkId: string, checkResultId: string) {
  const check = await checkly.getCheck(checkId);
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

  console.log("CHECK_RESULTS", checkResults.length);

  const failingCheckResults = checkResults.filter(
    (result) => result.hasFailures || result.hasErrors,
  );

  console.log("CHECK_RESULT_FAILURES", failingCheckResults.length);

  const promptDef = summarizeErrorsPrompt({
    check: check.id,
    locations: check.locations,
    frequency: check.frequency,
    interval,
    results: [...failingCheckResults, checkResult].map(summarizeCheckResult),
  });
  const { object: errorGroups } =
    await generateObject<SummarizeErrorsPromptType>(promptDef);

  console.log("ERROR_GROUPS", errorGroups);

  return createCheckResultBlock({
    check,
    checkAppUrl,
    checkResult,
    checkResultAppUrl,
    errorGroups,
    failingCheckResults,
    intervalStart: LAST_30_DAYS.from,
  });
}

async function checkSummary(checkId: string) {
  const check = await checkly.getCheck(checkId);

  const interval = last24h(new Date());

  const checkResults = await fetchCheckResults(checkly, {
    checkId: check.id,
    ...interval,
  });

  console.log("CHECK_RESULTS", checkResults.length);
  // console.log("CHECK_RESULTS", JSON.stringify(checkResults, null, 2));

  const failingCheckResults = checkResults.filter(
    (result) => result.hasFailures || result.hasErrors,
  );

  if (failingCheckResults.length === 0) {
    return {
      message: createCheckBlock({
        check,
        checkAppUrl: checkly.getCheckUrl(check.id),
        checkResults,
      }),
      image: null,
    };
  }

  console.log("CHECK_RESULT_FAILURES", failingCheckResults.length);

  const promptDef = summarizeErrorsPrompt({
    check: check.id,
    locations: check.locations,
    frequency: check.frequency,
    interval,
    results: failingCheckResults.map(summarizeCheckResult),
  });
  const { object: errorGroups } =
    await generateObject<SummarizeErrorsPromptType>(promptDef);

  console.log("ERROR_GROUPS", errorGroups);

  const heatmapImage = generateHeatmapPNG(checkResults, {
    bucketSizeInMinutes: check.frequency * 10,
    verticalSeries: check.locations.length,
  });

  const message = createCheckBlock({
    check,
    checkAppUrl: checkly.getCheckUrl(check.id),
    errorGroups,
    checkResults,
  });

  return { message, image: heatmapImage };
}
export const CHECKLY_COMMAND_NAME = "/checkly";

export const checklyCommandHandler = async ({ ack, respond, command }) => {
  await ack();

  const args = command.text.split(" ");
  if (args.length === 1 && !!args[0]) {
    const { message, image } = await checkSummary(args[0]);
    await respond({
      ...message,
    });

    // FIXME find a way to send the image to slack (al)
  } else if (args.length === 2) {
    const [checkId, checkResultId] = args;
    const summary = await checkResultSummary(checkId, checkResultId);

    await respond({
      ...summary,
    });
  } else {
    await respond({
      text: "Please provide either a check ID or both a check ID and check result ID in the format: /checkly <check_id> (<check_result_id>)",
    });
  }
};
