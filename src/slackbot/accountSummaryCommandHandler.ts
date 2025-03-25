import * as dataForge from "data-forge";
import { generateText } from "ai";
import { checkly } from "../checkly/client";
import { findCheckResultsAggregated } from "../db/check-results";
import { summarizeCheckResultsToLabeledCheckStatus } from "./check-results-labeled";
import {
  summariseMultipleChecksGoal,
  summarizeMultipleChecksStatus,
} from "../prompts/checkly";
import { CheckTable, readChecks } from "../db/check";
import { createAccountSummaryBlock } from "./blocks/accountSummaryBlock";
import { findErrorClustersForChecks } from "../db/error-cluster";
import { getExtraAccountSetupContext } from "./checkly-integration-utils";

export async function accountSummary(
  accountId: string,
  interval: { from: Date; to: Date },
) {
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

  const labeledChecks = labeledChecksFromChangePoints(
    checkResultsWithCheckpoints,
  );

  const delta = labeledChecks
    .groupBy((row) => row.checkId)
    .select((group) => {
      return {
        checkId: group.first().checkId,
        delta: Math.sign(group.deflate((row) => row.delta).sum()),
      };
    })
    .inflate()
    .getSeries("delta")
    .sum();
  const { passingChecksDelta, degradedChecksDelta, failingChecksDelta } = {
    passingChecksDelta: delta,
    degradedChecksDelta: 0,
    failingChecksDelta: delta * -1,
  };

  const failingChecks = labeledChecks
    .filter((row) => row.delta < 0)
    .getSeries<string>("checkId")
    .toArray();

  const changePointsSummary = await summarizeChangePoints(
    checkResultsWithCheckpoints,
  );

  const checkIdsWithChangePoints = [
    ...new Set(checkResultsWithCheckpoints.map((cr) => cr.checkId)),
  ];
  const checksWithChangePoints = await readChecks(checkIdsWithChangePoints);

  const failingChecksGoals = await summarizeChecksGoal(checksWithChangePoints);

  const errorPatterns = await findErrorClustersForChecks(
    accountSummary.checks.map((c) => c.id),
    { interval, resultType: "FINAL" },
  );

  const message = createAccountSummaryBlock({
    accountName: account.name,
    passingChecks: accountSummary.passing,
    passingChecksDelta,
    degradedChecks: accountSummary.degraded,
    degradedChecksDelta,
    failingChecks: accountSummary.failing,
    failingChecksDelta,
    hasIssues: checkResultsWithCheckpoints.length > 0,
    issuesSummary: changePointsSummary,
    failingChecksGoals,
    failingCheckIds: failingChecks,
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

  const labeledCheckResults = await summarizeCheckResultsToLabeledCheckStatus(
    aggregatedCheckResults,
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

function labeledChecksFromChangePoints(
  checkResultsWithCheckpoints: {
    checkId: string;
    runLocation: string;
    changePoints: {
      timestamp: number;
      formattedTimestamp: string;
      severity: "PASSING" | "DEGRADED" | "FAILING";
    }[];
  }[],
) {
  return new dataForge.DataFrame(checkResultsWithCheckpoints).select((row) => {
    const lastChangePoint = row.changePoints[row.changePoints.length - 1];
    return {
      checkId: row.checkId,
      runLocation: row.runLocation,
      delta: lastChangePoint.severity === "PASSING" ? 1 : -1,
    };
  });
}
