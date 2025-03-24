import { readCheckGroup } from "../../db/check-groups";
import {
  analyseCheckFailureHeatMap,
  SimpleErrorCategory,
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
import { getExtraAccountSetupContext } from "../checkly-integration-utils";
import { CheckTable, readCheck } from "../../db/check";

async function checkSummaryData(
  checkId: string,
  interval: { from: Date; to: Date },
) {
  const start = Date.now();
  const checkResults = await findCheckResults(
    checkId,
    interval.from,
    interval.to,
  );
  log.debug(
    {
      checkId,
      durationMs: Date.now() - start,
      fetchedCount: checkResults.length,
    },
    "Fetched check results",
  );

  if (checkResults.length === 0) {
    return {
      checkId,
      checkResults: [] as CheckResultTable[],
      runLocations: new Set<string>(),
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

  return {
    checkId,
    checkResults,
    runLocations,
    heatmapImage,
    lastRun,
    lastFailure,
    status,
    timeSlices,
  };
}

const summarizeCheckGoal = async (check: CheckTable): Promise<string> => {
  const extraAccountSetupContext = await getExtraAccountSetupContext();
  const prompt = summarizeTestGoalPrompt(check, extraAccountSetupContext);
  const { text: checkSummary } = await generateText(prompt);

  return checkSummary;
};

const analyseHeatmap = async (
  heatmapImage?: Buffer,
): Promise<{
  category: SimpleErrorCategory;
  failureIncidentsSummary: string;
}> => {
  if (!heatmapImage) {
    return {
      category: SimpleErrorCategory.FAILING, // Fall back to failing state
      failureIncidentsSummary:
        "No data available for failure incidents analysis",
    };
  }
  const result = await generateObject(analyseCheckFailureHeatMap(heatmapImage));

  return {
    category: result.object.category,
    failureIncidentsSummary: result.object.failureIncidentsSummary,
  };
};

export async function checkSummary(checkId: string) {
  const start = Date.now();
  const check = await readCheck(checkId);
  if (check.groupId) {
    const checkGroup = await readCheckGroup(BigInt(check.groupId));
    check.locations = checkGroup.locations;
  }

  const interval = last24h(new Date());

  const [{ checkResults, heatmapImage }, checkSummary, failureClusters] =
    await Promise.all([
      checkSummaryData(check.id, interval),
      summarizeCheckGoal(check),
      findErrorClustersForChecks(check.id, interval),
    ]);

  const failingCheckResults = checkResults.filter(
    (result) => result.hasFailures || result.hasErrors,
  );
  const errorPatterns = failureClusters.map((ec) => ({
    id: ec.id,
    description: ec.error_message.split("\n")[0],
    count: ec.count,
  }));

  const mostRecentFailureCheckResult = failingCheckResults.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )[0];
  const lastFailure =
    failingCheckResults.length > 0
      ? mostRecentFailureCheckResult.startedAt
      : checkResults[0]?.startedAt;

  const successRate =
    checkResults.length > 0
      ? Math.round(
          ((checkResults.length - failingCheckResults.length) /
            checkResults.length) *
            100,
        )
      : 0;
  const heatmapAnalysisStartedAt = Date.now();
  const { failureIncidentsSummary, category } =
    await analyseHeatmap(heatmapImage);

  log.info(
    {
      checkId,
      checkResultCount: checkResults.length,
      failingCheckResultCount: failingCheckResults.length,
      durationMs: Date.now() - start,
      heatmapAnalysisDurationMs: Date.now() - heatmapAnalysisStartedAt,
    },
    "checkSummary",
  );

  const message = generateCheckSummaryBlock({
    checkId,
    checkName: check.name,
    checkSummary: checkSummary,
    checkState: category,
    lastFailure,
    successRate,
    failureCount: failingCheckResults.length,
    lastFailureId: mostRecentFailureCheckResult?.id,
    timeLocationSummary: failureIncidentsSummary,
    errorPatterns,
  });

  return { message, image: heatmapImage };
}
