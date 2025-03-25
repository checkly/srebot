import { readCheckGroup } from "../../db/check-groups";
import { summarizeTestGoalPrompt } from "../../prompts/checkly";
import { generateText } from "ai";
import { last24h } from "../../prompts/checkly-data";
import { log } from "../../log";
import {
  findErrorClustersForChecks,
  getOldestMembershipDatesForErrors,
} from "../../db/error-cluster";
import generateCheckSummaryBlock, {
  CheckStatus,
  FailurePattern,
} from "../blocks/newCheckSummaryBlock";
import { CheckResultTable, findCheckResults } from "../../db/check-results";
import {
  aggregateCheckResults,
  CheckResultsTimeSlice,
} from "../check-result-slices";
import { getExtraAccountSetupContext } from "../checkly-integration-utils";
import { CheckTable, readCheck } from "../../db/check";
import { keyBy } from "lodash";
import { analyseStability } from "../analysis/analyseStability";

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

  return {
    checkId,
    checkResults,
    runLocations,
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

const getErrorPatterns = async (
  checkId: string,
  interval: { from: Date; to: Date },
): Promise<FailurePattern[]> => {
  const startedAt = Date.now();
  const failureClusters = await findErrorClustersForChecks(checkId, {
    interval,
    resultType: "FINAL",
  });
  const errorIds = failureClusters.map((ec) => ec.id);

  const oldestMembershipDatesForErrors =
    await getOldestMembershipDatesForErrors(checkId, errorIds);
  const oldestMembershipByErrorId: Record<
    string,
    {
      date: Date;
      error_id: string;
    }
  > = keyBy(oldestMembershipDatesForErrors, "error_id");

  log.debug(
    {
      checkId,
      durationMs: Date.now() - startedAt,
      clusterCount: failureClusters.length,
    },
    "Found error clusters",
  );

  return failureClusters
    .map((ec) => ({
      id: ec.id,
      description: ec.error_message.split("\n")[0],
      count: ec.count,
      firstSeenAt: oldestMembershipByErrorId[ec.id].date,
    }))
    .sort((a, b) => b.count - a.count);
};

const getCheckStatus = (checkResults: CheckResultTable[]): CheckStatus => {
  const mostRecent = checkResults.findLast(
    (element) => element.resultType === "FINAL",
  );

  if (!mostRecent) {
    return "UNKNOWN";
  }
  if (mostRecent.hasFailures || mostRecent.hasErrors) {
    return "FAILING";
  }
  if (mostRecent.isDegraded) {
    return "DEGRADED";
  }
  return "PASSING";
};

export async function checkSummary(checkId: string) {
  const start = Date.now();
  const check = await readCheck(checkId);
  if (check.groupId) {
    const checkGroup = await readCheckGroup(BigInt(check.groupId));
    check.locations = checkGroup.locations;
  }

  const interval = last24h(new Date());

  const [{ checkResults }, checkSummary, errorPatterns] = await Promise.all([
    checkSummaryData(check.id, interval),
    summarizeCheckGoal(check),
    getErrorPatterns(check.id, interval),
  ]);

  const finalCheckResults = checkResults.filter(
    (result) => result.resultType === "FINAL",
  );
  const failingCheckResults = finalCheckResults.filter(
    (result) => result.hasFailures || result.hasErrors,
  );

  const mostRecentFailureCheckResult = failingCheckResults.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )[0];
  const lastFailure =
    failingCheckResults.length > 0
      ? mostRecentFailureCheckResult.startedAt
      : undefined;

  const successRate =
    finalCheckResults.length > 0
      ? Math.round(
          ((finalCheckResults.length - failingCheckResults.length) /
            finalCheckResults.length) *
            100,
        )
      : 0;

  const llmAnalysisStartedAt = Date.now();
  const [stabilityAnalysis] = await Promise.all([
    analyseStability(checkResults, interval),
  ]);

  log.info(
    {
      checkId,
      checkResultCount: checkResults.length,
      failingCheckResultCount: failingCheckResults.length,
      durationMs: Date.now() - start,
      llmAnalysisDurationMs: Date.now() - llmAnalysisStartedAt,
    },
    "checkSummary",
  );
  const message = generateCheckSummaryBlock({
    checkId,
    checkName: check.name,
    checkSummary: checkSummary,
    checkHealth: stabilityAnalysis.stability,
    checkStatus: getCheckStatus(checkResults),
    lastFailureAt: lastFailure,
    successRate,
    errorPatterns,
    failureCount: failingCheckResults.length,
    lastFailureId: mostRecentFailureCheckResult?.id,
    failureAnalysis: stabilityAnalysis.failuresAnalysis,
    retriesAnalysis: stabilityAnalysis.retriesAnalysis,
    degradationsAnalysis: stabilityAnalysis.degradationsAnalysis,
  });

  return { message };
}
