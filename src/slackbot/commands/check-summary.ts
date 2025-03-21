import { readCheckGroup } from "../../db/check-groups";
import {
  analyseCheckFailureHeatMap,
  summarizeTestGoalPrompt,
} from "../../prompts/checkly";
import { generateObject, generateText } from "ai";
import { last24h } from "../../prompts/checkly-data";
import { log } from "../../log";
import { findErrorClustersForChecks } from "../../db/error-cluster";
import generateCheckSummaryBlock from "../blocks/newCheckSummaryBlock";
import { CheckResultTable, findCheckResults } from "../../db/check-results";
import {
  aggregateCheckResults,
  CheckResultsTimeSlice,
} from "../check-result-slices";
import { generateHeatmap } from "../../heatmap/generateHeatmap";
import { checkly } from "../../checkly/client";
import { getExtraAccountSetupContext } from "../checkly-integration-utils";

async function checkSummaryData(
  checkId: string,
  interval: { from: Date; to: Date },
) {
  const checkResults = await findCheckResults(
    checkId,
    interval.from,
    interval.to,
  );

  if (checkResults.length === 0) {
    return {
      checkId,
      checkResults: [] as CheckResultTable[],
      runLocations: new Set<string>(),
      checkCategory: "PASSING",
      heatmapImage: Buffer.from([]),
      lastRun: null,
      lastFailure: null,
      status: "passing",
      timeSlices: [] as CheckResultsTimeSlice[],
    };
  }

  const timeSlices = aggregateCheckResults(
    checkResults,
    interval.from,
    interval.to,
  );

  const lastRun = checkResults[0];
  const lastFailure = checkResults.find((cr) => cr.hasFailures || cr.hasErrors);

  const status =
    lastRun.hasFailures || lastRun.hasErrors
      ? "failing"
      : lastRun.isDegraded
        ? "degraded"
        : "passing";

  const runLocations = checkResults.reduce((acc, cr) => {
    acc.add(cr.runLocation);
    return acc;
  }, new Set<string>());

  const heatmapImage = generateHeatmap(
    checkResults,
    interval.from,
    interval.to,
    {
      bucketSizeInMinutes: 30,
      verticalSeries: runLocations.size,
    },
  );

  const checkCategory = (
    await generateObject(analyseCheckFailureHeatMap(heatmapImage))
  ).object.category;

  return {
    checkId,
    checkResults,
    runLocations,
    checkCategory,
    heatmapImage,
    lastRun,
    lastFailure,
    status,
    timeSlices,
  };
}

export async function checkSummary(checkId: string) {
  const start = Date.now();
  // TODO replace it with data fetched from DB
  const check = await checkly.getCheck(checkId, { includeDependencies: true });
  if (check.groupId) {
    const checkGroup = await readCheckGroup(BigInt(check.groupId));
    check.locations = checkGroup.locations;
  }

  const extraAccountSetupContext = await getExtraAccountSetupContext();

  const prompt = summarizeTestGoalPrompt(check, extraAccountSetupContext);
  const { text: checkSummary } = await generateText(prompt);

  const interval = last24h(new Date());

  const { checkResults, checkCategory, heatmapImage } = await checkSummaryData(
    check.id,
    interval,
  );
  log.debug(
    {
      checkResultsLength: checkResults.length,
      durationMs: Date.now() - start,
      checkId,
    },
    "Fetched check results",
  );

  const failingCheckResults = checkResults.filter(
    (result) => result.hasFailures || result.hasErrors,
  );

  const failureClusters = await findErrorClustersForChecks(check.id);
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

  const heatmapPromptResult = await generateObject(
    analyseCheckFailureHeatMap(heatmapImage),
  );

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
