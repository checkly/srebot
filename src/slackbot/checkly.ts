import { generateObject, generateText } from "ai";
import { checkly } from "../checkly/client";
import * as dataForge from "data-forge";
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
import { readCheck, readChecks } from "../db/check";
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

  const labeledCheckResults = await summarizeCheckResultsToLabeledCheckStatus(
    aggregatedCheckResults,
  );

  const checkResultsWithCheckpoints = labeledCheckResults
    .toArray()
    .filter((cr) => cr.changePoints.length > 0);

  const { text: summary } = await generateText(
    summarizeMultipleChecksStatus(checkResultsWithCheckpoints),
  );

  const failingChecks = checkResultsWithCheckpoints.map((cr) => cr.checkId);
  const targetChecks = await readChecks(failingChecks);

  const { text: goals } = await generateText(
    summariseMultipleChecksGoal(targetChecks, 30),
  );

  const message = createAccountSummaryBlock({
    accountName: account.name,
    passingChecks: counts.passing,
    degradedChecks: counts.degraded,
    failingChecks: counts.failing,
    hasIssues: checkResultsWithCheckpoints.length > 0,
    issuesSummary: summary,
    failingChecksGoals: goals,
  });

  return { message };
}

function toTimeBucket(startedAt: Date, bucketSizeInMinutes: number) {
  const startedAtDate = new Date(startedAt);
  const minutes = startedAtDate.getMinutes();
  const sliceMinute =
    Math.floor(minutes / bucketSizeInMinutes) * bucketSizeInMinutes;
  const sliceDate = new Date(startedAtDate);
  sliceDate.setMinutes(sliceMinute, 0, 0); // Set to start of 30-min bucket
  return sliceDate;
}

const hourlyFormatter = new Intl.DateTimeFormat("en-US", {
  hour12: false,
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

export async function summarizeCheckResultsToLabeledCheckStatus(
  aggregatedCheckResults: CheckResultAggregate[],
) {
  let df = new dataForge.DataFrame(aggregatedCheckResults);

  const meanPassRatePerCheckAndLocation = df
    .groupBy((row) => `${row.checkId}|${row.runLocation}`)
    .select((group) => {
      const passing = group.deflate((row) => row.passingCount).sum();
      const degraded = group.deflate((row) => row.degradedCount).sum();
      const failing = group.deflate((row) => row.errorCount).sum();
      const passRateStdDev = group
        .deflate((row) => row.passingCount / row.count)
        .std();
      const meanPassRate = passing / (passing + degraded + failing);

      return {
        checkId: group.first().checkId,
        runLocation: group.first().runLocation,
        meanPassRate,
        passRateStdDev,
      };
    })
    .reduce((acc, row) => {
      acc.set(`${row.checkId}|${row.runLocation}`, {
        meanPassRate: row.meanPassRate,
        passRateStdDev: row.passRateStdDev,
      });
      return acc;
    }, new Map<string, { meanPassRate: number; passRateStdDev: number }>());

  log.debug("MEAN PASS RATE\n" + meanPassRatePerCheckAndLocation.toString());

  interface CheckTimeSlice {
    checkId: string;
    runLocation: string;
    startedAtBin: Date;
    passing: number;
    degraded: number;
    failing: number;
    passRate: number;
    passRateDiff: number;
    passRateStdDev: number;
    degradedRate: number;
    failRate: number;
    cumSumPassRate?: number;
  }

  const checkIdLocationTimeSliceWithPassRateStdDev = df
    .groupBy((row) => `${row.checkId}|${row.runLocation}|${row.startedAtBin}`)
    .select((group): CheckTimeSlice => {
      const checkId = group.first().checkId;
      const runLocation = group.first().runLocation;
      const { meanPassRate, passRateStdDev } =
        meanPassRatePerCheckAndLocation.get(`${checkId}|${runLocation}`)!;

      const count = group.deflate((row) => row.count).sum();
      const passing = group.deflate((row) => row.passingCount).sum();
      const degraded = group.deflate((row) => row.degradedCount).sum();
      const failing = group.deflate((row) => row.errorCount).sum();

      const passRate = passing / count;
      const degradedRate = degraded / count;
      const failRate = failing / count;

      return {
        checkId: group.first().checkId,
        runLocation: group.first().runLocation,
        startedAtBin: group.first().startedAtBin,
        passing,
        degraded,
        failing,
        passRate: passRate,
        passRateDiff: passRate - meanPassRate,
        passRateStdDev,
        degradedRate,
        failRate: failRate,
      };
    })
    .inflate()
    .withSeries<CheckTimeSlice & { cumSumPassRate: number }>(
      "cumSumPassRate",
      (s) => s.getSeries("passRateDiff").cumsum(),
    )
    .withSeries<
      CheckTimeSlice & { cumSumPassRate: number; isCheckPoint: boolean }
    >("isCheckPoint", (s) =>
      s.deflate((row) =>
        Math.abs(row.cumSumPassRate) > row.passRateStdDev * 2 ? 1 : 0,
      ),
    )
    .withSeries<
      CheckTimeSlice & {
        cumSumPassRate: number;
        isCheckPoint: boolean;
        checkPointGroup: number;
      }
    >("checkPointGroup", (s) =>
      new dataForge.Series([0]).concat(
        s
          .getSeries("isCheckPoint")
          .rollingWindow(2)
          .select((w) => {
            const firstIsCheckPoint = w.first();
            const lastIsCheckPoint = w.last();
            return firstIsCheckPoint === lastIsCheckPoint ? 0 : 1;
          })
          .cumsum(),
      ),
    );

  log.debug(
    "CHECK ID LOCATION TIME SLICE WITH PASS RATE STD DEV\n" +
      checkIdLocationTimeSliceWithPassRateStdDev.toString(),
  );

  const checksWithChangePoints = checkIdLocationTimeSliceWithPassRateStdDev
    .groupBy((row) => `${row.checkId}|${row.runLocation}`)
    .select((group) => {
      const changePoints = group
        .filter((row) => row.isCheckPoint)
        .groupBy((row) => row.checkPointGroup)
        .select((group) =>
          group.orderBy((row) => Math.abs(row.cumSumPassRate)).last(),
        )
        .toArray();

      return {
        checkId: group.first().checkId,
        runLocation: group.first().runLocation,
        changePoints: changePoints.map((cp) => ({
          timestamp: cp.startedAtBin.getTime(),
          formattedTimestamp: hourlyFormatter.format(cp.startedAtBin),
          severity:
            cp.failRate > 0
              ? "FAILING"
              : cp.degradedRate > 0
                ? "DEGRADED"
                : "PASSING",
        })),
      };
    })
    .inflate();

  log.debug("CHECKS WITH CHANGE POINTS\n" + checksWithChangePoints.toString());

  return checksWithChangePoints;
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

export const checklyCommandHandler = (app: App<StringIndexed>) => {
  return async ({ ack, respond, command }) => {
    await ack();
    const args = command.text.split(" ");
    if (args.length == 1 && args[0].trim() === "") {
      const accountId = process.env.CHECKLY_ACCOUNT_ID!;
      const { message } = await accountSummary(accountId);
      await respond(message);
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
