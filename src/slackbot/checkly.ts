import { generateObject, generateText } from "ai";
import { checkly } from "../checkly/client";
import {
  analyseCheckFailureHeatMap,
  summariseMultipleChecksGoal,
  summarizeErrorsPrompt,
  SummarizeErrorsPromptType,
  summarizeMultipleChecksStatus,
  summarizeTestGoalPrompt,
} from "../prompts/checkly";
import {
  fetchCheckResults,
  last24h,
  summarizeCheckResult,
} from "../prompts/checkly-data";
import { createCheckResultBlock } from "./blocks/checkResultBlock";
import { log } from "../log";
import { App, StringIndexed } from "@slack/bolt";
import { readCheck, readChecks, readChecksWithGroupNames } from "../db/check";
import { findErrorClustersForCheck } from "../db/error-cluster";
import {
  CheckResultAggregate,
  CheckResultTable,
  findCheckResults,
  findCheckResultsAggregated,
} from "../db/check-results";
import { readCheckGroup } from "../db/check-groups";
import generateCheckSummaryBlock from "./blocks/newCheckSummaryBlock";
import { analyseMultipleChecks } from "../use-cases/analyse-multiple/analyse-multiple-checks";
import { createMultipleCheckAnalysisBlock } from "./blocks/multipleChecksAnalysisBlock";
import { generateHeatmap } from "../heatmap/generateHeatmap";
import { createAccountSummaryBlock } from "./blocks/accountSummaryBlock";
import { aggregateCheckResults } from "./check-result-slices";
import { CheckResultsTimeSlice } from "./check-result-slices";
import { summarizeCheckResultsToLabeledCheckStatus } from "./check-results-labeled";
import { renderFailingChecksBlock } from "./blocks/failingChecksBlock";
import * as dataForge from "data-forge";

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

async function accountSummary(accountId: string) {
  const account = await checkly.getAccount(accountId);

  const interval = last24h(new Date());

  const statuses = await checkly.getStatuses();

  const counts = statuses.reduce(
    (acc, cr) => {
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

  log.info(
    {
      accountId,
      ...counts,
    },
    "accountSummary",
  );

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

  log.info(
    {
      checkResultsWithCheckpointsLength: JSON.stringify(
        checkResultsWithCheckpoints,
      ),
    },
    "checkResultsWithCheckpoints",
  );

  const { text: summary } = await generateText(
    summarizeMultipleChecksStatus(checkResultsWithCheckpoints),
  );

  const failingCheckIds = checkResultsWithCheckpoints.map((cr) => cr.checkId);
  const targetChecks = await readChecks(failingCheckIds);

  const { text: goals } = await generateText(
    summariseMultipleChecksGoal(targetChecks, 30),
  );

  log.info(
    {
      failingCheckIds,
    },
    "failingCheckIds",
  );

  const message = createAccountSummaryBlock({
    accountName: account.name,
    passingChecks: counts.passing,
    degradedChecks: counts.degraded,
    failingChecks: counts.failing,
    hasIssues: checkResultsWithCheckpoints.length > 0,
    issuesSummary: summary,
    failingChecksGoals: goals,
    failingCheckIds,
  });

  return { message };
}

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

// Allow overriding the command name for local dev
export const CHECKLY_COMMAND_NAME =
  process.env.CHECKLY_COMMAND_NAME_OVERRIDE || "/checkly";

const getIsUUID = (str: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    str,
  );
};

export const showFailingChecksActionHandler = () => {
  return async ({ ack, respond, body }) => {
    await ack();
    log.info({ body: JSON.stringify(body) }, "showFailingChecksActionHandler");
    const interval = last24h(new Date());
    const checkIds = (body.actions[0].value as string).split(",");
    const groupNamesForCheckIds = (
      await readChecksWithGroupNames(checkIds)
    ).reduce(
      (acc, check) => {
        acc[check.id] = check.groupName;
        return acc;
      },
      {} as Record<string, string>,
    );

    console.log(groupNamesForCheckIds);

    const checkResults = await findCheckResults(
      checkIds,
      interval.from,
      interval.to,
    );

    const checkResultsDF = new dataForge.DataFrame(checkResults);

    const failedChecks = checkResultsDF
      .groupBy((cr) => cr.checkId)
      .map((group) => ({
        checkId: group.first().checkId,
        checkState: (group.first().hasFailures || group.first().hasErrors
          ? "FAILED"
          : group.first().isDegraded
            ? "DEGRADED"
            : "PASSED") as "FAILED" | "DEGRADED" | "PASSED",
        name: group.first().name,
        failures: {
          total: group
            .deflate((cr) => (cr.hasFailures || cr.hasErrors ? 1 : 0))
            .sum(),
          timeframe: "24h",
        },
        group: groupNamesForCheckIds[group.first().checkId],
        lastFailure: (() => {
          const lastFailure = group
            .where((cr) => cr.hasFailures || cr.hasErrors || cr.isDegraded)
            .orderBy((cr) => cr.startedAt)
            .last();
          return lastFailure
            ? {
                checkResultId: lastFailure.id,
                timestamp: lastFailure.startedAt,
              }
            : null;
        })(),
      }))
      .toArray();

    const message = renderFailingChecksBlock(failedChecks);
    await respond({ response_type: "in_channel", ...message });
  };
};

export const checklyCommandHandler = (app: App<StringIndexed>) => {
  return async ({ ack, respond, command }) => {
    await ack();
    const args = command.text.split(" ");
    if (args.length == 1 && args[0].trim() === "") {
      const accountId = process.env.CHECKLY_ACCOUNT_ID!;
      const { message } = await accountSummary(accountId);
      await respond({ response_type: "in_channel", ...message });
    } else if (args.length == 1 && !getIsUUID(args[0])) {
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
          filename: "CheckResultsPerLocation.png",
          title: "Check Results per Location",
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
