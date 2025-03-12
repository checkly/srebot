import { generateObject, generateText } from "ai";
import { checkly } from "../checkly/client";
import * as dataForge from "data-forge";
import {
  analyseCheckFailureHeatMap,
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
import { readCheck } from "../db/check";
import { findErrorClustersForCheck } from "../db/error-cluster";
import { CheckResultTable, findCheckResults } from "../db/check-results";
import { readCheckGroup } from "../db/check-groups";
import generateCheckSummaryBlock from "./blocks/newCheckSummaryBlock";
import { analyseMultipleChecks } from "../use-cases/analyse-multiple/analyse-multiple-checks";
import { createMultipleCheckAnalysisBlock } from "./blocks/multipleChecksAnalysisBlock";
import { generateHeatmap } from "../heatmap/generateHeatmap";
import { createAccountSummaryBlock } from "./blocks/accountSummaryBlock";
import {
  aggregateCheckResults,
  CheckResultsTimeSlice,
} from "./check-result-slices";
import { date } from "zod";
import { DevBundlerService } from "next/dist/server/lib/dev-bundler-service";

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
      durationMs: Date.now() - startedAt,
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

  const heatmapImage = generateHeatmap(
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

async function accountSummary(accountId: string) {
  const account = await checkly.getAccount(accountId);
  const checks = await checkly.getChecks();

  const interval = last24h(new Date());

  const checkResults = await Promise.all(
    checks.map((check) => checkSummaryData(check.id, interval)),
  );

  log.info({ checkResults }, "accountSummary");

  const passingChecks = checkResults.filter((cr) => cr.status === "passing");
  const degradedChecks = checkResults.filter((cr) => cr.status === "degraded");
  const failingChecks = checkResults.filter((cr) => cr.status === "failing");

  const result = await summarizeCheckResultsToLabeledCheckStatus(
    checkResults.flatMap((cr) => cr.checkResults),
  );

  const { text: summary } = await generateText(
    summarizeMultipleChecksStatus(result.toArray()),
  );

  // console.log(JSON.stringify(patterns, null, 2));

  // log.info({ patterns: JSON.stringify(patterns) }, "accountSummaryPatterns");

  const message = createAccountSummaryBlock({
    accountName: account.name,
    passingChecks: passingChecks.length,
    degradedChecks: degradedChecks.length,
    failingChecks: failingChecks.length,
    hasIssues: false,
    issuesSummary: summary,
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

export async function summarizeCheckResultsToLabeledCheckStatus(
  checkResults: CheckResultTable[],
) {
  const checkResultsView = checkResults.map(
    ({
      checkId,
      runLocation,
      startedAt,
      hasFailures,
      hasErrors,
      isDegraded,
    }) => ({
      checkId,
      runLocation,
      startedAtBucket: toTimeBucket(startedAt, 30).getTime(),
      passing: !hasFailures && !hasErrors && !isDegraded ? 1 : 0,
      degraded: !hasFailures && !hasErrors && isDegraded ? 1 : 0,
      failing: hasFailures || hasErrors ? 1 : 0,
    }),
  );

  let df = new dataForge.DataFrame(checkResultsView);

  console.log("DF", df.tail(10).toArray());

  const aggregatedDf = df
    .groupBy(
      (row) => `${row.checkId}|${row.runLocation}|${row.startedAtBucket}`,
    )
    .select((group) => ({
      checkId: group.first().checkId,
      runLocation: group.first().runLocation,
      startedAtBucket: group.first().startedAtBucket,
      passing: group.deflate((row) => row.passing).sum(),
      degraded: group.deflate((row) => row.degraded).sum(),
      failing: group.deflate((row) => row.failing).sum(),
    }))
    .inflate();

  console.log("AGGREGATED DF", aggregatedDf.tail(10).toArray());

  const pivotedDf = aggregatedDf
    .groupBy((row) => `${row.startedAtBucket}`)
    .select((group) => {
      const result = {
        startedAtBucket: group.first().startedAtBucket,
      };
      group.forEach((row) => {
        result[row.checkId + "|" + row.runLocation] = [
          row.passing / (row.passing + row.degraded + row.failing),
          row.degraded / (row.passing + row.degraded + row.failing),
          row.failing / (row.passing + row.degraded + row.failing),
        ];
      });
      return result;
    })
    .inflate();

  console.log("PIVOTED DF", pivotedDf.tail(10).toArray());

  const bucketTimestamps = pivotedDf.getColumns().first();

  const columns = pivotedDf.dropSeries("startedAtBucket").getColumns();

  console.log("COLUMNS", columns.map((c) => c.name).toArray());

  const labeledResults = columns.map((column) => {
    let [checkId, location] = column.name.split("|");
    let cdf = new dataForge.DataFrame({
      columns: {
        timestamp: bucketTimestamps.series,
        value: column.series,
      },
    })
      .withSeries(
        "errorGroupId",
        new dataForge.Series([0]).concat(
          column.series
            .rollingWindow(2)
            .select((w, i) => {
              if (!w.first() || !w.last()) return 0;
              const firstPassingRate = w.first()[0];
              const lastPassingRate = w.last()[0];
              const passingRateChange = Math.abs(
                lastPassingRate - firstPassingRate,
              );

              return passingRateChange > 0.05 ? 1 : 0;

              // const firstDegradedOrFailed =
              //   (w.first() && w.first()[1] > 0) ||
              //   (w.first() && w.first()[2] > 0);
              // const lastDegradedOrFailed =
              //   (w.last() && w.last()[1] > 0) || (w.last() && w.last()[2] > 0);
              // return firstDegradedOrFailed === lastDegradedOrFailed ? 0 : 1;
            })
            .cumsum(),
        ),
      )
      .withSeries(
        "severity",
        column.series.select((w) =>
          w && w[2] > 0.05
            ? "FAILING"
            : w && w[1] > 0.05
              ? "DEGRADED"
              : "PASSING",
        ),
      )
      .groupBy((row) => `${row.errorGroupId}`)
      .select((group) => ({
        bucketFirst: group.first().timestamp,
        bucketLast: group.last().timestamp,
        bucketCount: group.count(),
        severity: group.first().severity,
      }))
      .filter((row) => row.bucketCount > 2)
      .inflate();

    const firstSeverity = cdf.first().severity;
    const lastSeverity = cdf.last().severity;

    let severity;
    if (lastSeverity === "PASSING" && firstSeverity === "PASSING") {
      severity = "PASSING";
    } else if (lastSeverity === "FAILING" && firstSeverity === "FAILING") {
      severity = "FAILING";
    } else if (lastSeverity === "DEGRADED" && firstSeverity === "DEGRADED") {
      severity = "DEGRADED";
    } else if (lastSeverity === "PASSING" && firstSeverity === "FAILING") {
      severity = "NEW_FAILING";
    } else if (lastSeverity === "PASSING" && firstSeverity === "DEGRADED") {
      severity = "NEW_DEGRADED";
    } else if (lastSeverity === "DEGRADED" && firstSeverity === "PASSING") {
      severity = "RECOVERED";
    } else if (lastSeverity === "DEGRADED" && firstSeverity === "FAILING") {
      severity = "NEW_FAILING";
    } else if (lastSeverity === "FAILING" && firstSeverity === "DEGRADED") {
      severity = "NEW_DEGRADED";
    } else if (lastSeverity === "FAILING" && firstSeverity === "PASSING") {
      severity = "RECOVERED";
    } else {
      severity = "UNKNOWN";
    }

    return {
      checkId,
      location,
      severity,
      patternStart: cdf.first().bucketLast,
    };
  });

  console.log("LABELED RESULTS", labeledResults.toArray().length);

  return labeledResults;
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

  const heatmapImage = generateHeatmapPNG(checkResults, {
    bucketSizeInMinutes: 30,
    verticalSeries: runLocations.size,
  });

  const checkCategory = (
    await generateObject(categorizeTestResultHeatMap(heatmapImage))
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
