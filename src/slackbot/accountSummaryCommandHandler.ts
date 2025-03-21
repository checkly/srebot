import { generateText } from "ai";
import { checkly } from "../checkly/client";
import { findCheckResultsAggregated } from "../db/check-results";
import { last24h } from "../prompts/checkly-data";
import { summarizeCheckResultsToLabeledCheckStatus } from "./check-results-labeled";
import {
  summariseMultipleChecksGoal,
  summarizeMultipleChecksStatus,
} from "../prompts/checkly";
import { CheckTable, readChecks } from "../db/check";
import { createAccountSummaryBlock } from "./blocks/accountSummaryBlock";
import { findErrorClustersForChecks } from "../db/error-cluster";
import { getExtraAccountSetupContext } from "./checkly-integration-utils";

export async function accountSummary(accountId: string) {
  const interval = last24h(new Date());
  const account = await checkly.getAccount(accountId);

  const accountSummary = await getAccountSummary();
  if (!accountSummary.checks) {
    return {
      message: {
        text: "No checks found for account",
        blocks: [],
      },
    };
  }

  const checkResultsWithCheckpoints = await getChangePoints(
    accountId,
    interval,
  );

  const changePointsSummary = await summarizeChangePoints(
    checkResultsWithCheckpoints,
  );

  const checkIdsWithChangePoints = checkResultsWithCheckpoints.map(
    (cr) => cr.checkId,
  );
  const checksWithChangePoints = await readChecks(checkIdsWithChangePoints);

  const failingChecksGoals = await summarizeChecksGoal(checksWithChangePoints);

  const errorPatterns = await findErrorClustersForChecks(
    accountSummary.checks.map((c) => c.id),
    interval,
  );

  const message = createAccountSummaryBlock({
    accountName: account.name,
    passingChecks: accountSummary.passing,
    degradedChecks: accountSummary.degraded,
    failingChecks: accountSummary.failing,
    hasIssues: checkResultsWithCheckpoints.length > 0,
    issuesSummary: changePointsSummary,
    failingChecksGoals,
    failingCheckIds: checkIdsWithChangePoints,
    errorPatterns: errorPatterns.map((ec) => ({
      id: ec.id,
      description: ec.error_message.split("\n")[0],
      count: ec.count,
    })),
  });

  return { message };
}

async function summarizeChecksGoal(
  checkWithChangePoints: CheckTable[],
): Promise<string> {
  if (checkWithChangePoints.length === 0) {
    return "No change in check reliability, thus no impact on your customers.";
  }

  const extraContext = await getExtraAccountSetupContext();
  return (
    await generateText(
      summariseMultipleChecksGoal(checkWithChangePoints, {
        maxTokens: 30,
        extraContext,
      }),
    )
  ).text;
}

async function summarizeChangePoints(
  checkResultsWithCheckpoints: {
    checkId: string;
    runLocation: string;
    changePoints: {
      timestamp: number;
      formattedTimestamp: string;
      severity: string;
    }[];
  }[],
): Promise<string> {
  if (checkResultsWithCheckpoints.length === 0) {
    return "We haven't detected any impactful changes in check reliability within the last 24 hours.";
  }

  return (
    await generateText(
      summarizeMultipleChecksStatus(checkResultsWithCheckpoints),
    )
  ).text;
}

async function getChangePoints(
  accountId: string,
  interval: { from: Date; to: Date },
) {
  const aggregatedCheckResults = await findCheckResultsAggregated({
    accountId: accountId,
    from: interval.from,
    to: interval.to,
  });

  const aggregatedCheckResultsWithFailures = aggregatedCheckResults.filter(
    (cr) => (cr.errorCount > 0 || cr.degradedCount > 0) && cr.passingCount > 0,
  );

  const labeledCheckResults = await summarizeCheckResultsToLabeledCheckStatus(
    aggregatedCheckResultsWithFailures,
  );

  const checkResultsWithCheckpoints = labeledCheckResults
    .toArray()
    .filter((cr) => cr.changePoints.length > 0);
  return checkResultsWithCheckpoints;
}

async function getAccountSummary() {
  const statuses = await checkly.getStatuses();
  const activatedChecks = await checkly.getActivatedChecks();

  const counts = statuses.reduce(
    (acc, cr) => {
      const check = activatedChecks.find((c) => c.id === cr.checkId);
      if (!check) {
        return acc;
      }
      if (!cr.hasErrors && !cr.hasFailures && !cr.isDegraded) {
        acc.passing++;
      }
      if (cr.isDegraded) {
        acc.degraded++;
      }
      if (cr.hasErrors || cr.hasFailures) {
        acc.failing++;
      }
      return acc;
    },
    { passing: 0, degraded: 0, failing: 0 },
  );

  return { ...counts, checks: activatedChecks };
}
