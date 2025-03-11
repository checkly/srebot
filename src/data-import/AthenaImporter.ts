import { parse } from "csv-parse/sync";
import { CheckResult } from "../checkly/models";
import { groupBy, parseInt, sortBy } from "lodash";
import { CheckResultsInserter } from "./DataInserter";
import { ChecklyClient } from "../checkly/checklyclient";

type RawCsvRecord = {
  id: string;
  checkid: string;
  attempts: string;
  source: string;
  type: string;
  location: string;
  name: string;
  haserrors: string;
  hasfailures: string;
  isdegraded: string;
  aborted: string;
  durationinms: string;
  startedat: string;
  stoppedat: string;
  metadata: string;
  assets: string;
  sequenceid: string;
};

export class AthenaImporter {
  private inserter: CheckResultsInserter;

  constructor(props: { inserter?: CheckResultsInserter } = {}) {
    this.inserter = props.inserter || new CheckResultsInserter();
  }

  async importAccountData(accountId: string, from: Date, to: Date) {
    const checklyClient = new ChecklyClient({
      apiKey: process.env.CHECKLY_API_KEY,
      accountId: accountId,
    });
    const checks = await checklyClient.getChecks();

    const file = await this.fetchCsv(accountId, from, to);
    const csvAsText = await file.text();
    const parsedRecords = this.parseCsv(accountId, csvAsText);

    // We need to provide explicit list of known checkIds to correctly mark checks without any results as synced
    const checkIds = checks.map((check) => check.id);
    const listOfKnownCheckIds = this.settleCheckIds(parsedRecords, checkIds);

    await this.insertCheckResults(
      parsedRecords,
      from,
      listOfKnownCheckIds,
      accountId,
    );
  }

  private async fetchCsv(
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<Response> {
    const url = `${process.env.ATHENA_ACCESS_ENDPOINT_URL}?from=${from.getTime()}&to=${to.getTime()}`;

    // You can supply these via environment variables or replace with your literal values.
    const apiKey = process.env.CHECKLY_API_KEY;

    // Fetch the CSV file using node fetch with the required headers.
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-checkly-account": accountId,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch CSV: ${response.statusText} details: ${JSON.stringify(await response.json())}`,
      );
    }
    const parsedResponse = await response.json();

    const signedUrl = parsedResponse.signedUrl;
    if (!signedUrl) {
      throw new Error(
        `No signedUrl found in response: ${JSON.stringify(parsedResponse)}`,
      );
    }

    return await fetch(signedUrl);
  }

  parseCsv(accountId: string, csvData: string): Partial<CheckResult>[] {
    const records: RawCsvRecord[] = parse(csvData, {
      columns: true, // Use the first row as header names for object keys
      skip_empty_lines: true,
      trim: true, // Remove extra whitespace around fields
    });

    // This is ugly but it works
    //
    const sequenceIdToMaxAttemptsMap: Record<string, number> = {};
    records.forEach((record) => {
      const sequenceId = record.sequenceid;
      const latestStartedAt = new Date(record.startedat).getTime();

      if (!sequenceIdToMaxAttemptsMap[sequenceId]) {
        sequenceIdToMaxAttemptsMap[sequenceId] = latestStartedAt;
      } else if (sequenceIdToMaxAttemptsMap[sequenceId] < latestStartedAt) {
        sequenceIdToMaxAttemptsMap[sequenceId] = latestStartedAt;
      }
    });

    return records
      .filter(
        (record) =>
          ["SCHEDULER", "SCHEDULE_NOW"].includes(record.source) &&
          ["API", "BROWSER", "MULTI_STEP"].includes(record.type),
      )
      .map((record) => {
        const startedAt = new Date(record.startedat);
        const stoppedAt = new Date(record.stoppedat);
        const responseTime = parseInt(record.durationinms);
        const attempts = parseInt(record.attempts);
        const resultType =
          sequenceIdToMaxAttemptsMap[record.sequenceid] ===
          new Date(record.startedat).getTime()
            ? "FINAL"
            : "ATTEMPT";

        const result: Partial<CheckResult> = {
          attempts,
          apiCheckResult: null,
          browserCheckResult: null,
          multiStepCheckResult: null,
          checkRunId: 0,
          hasErrors: record.haserrors === "true",
          hasFailures: record.hasfailures === "true",
          isDegraded: record.isdegraded === "true",
          name: record.name,
          overMaxResponseTime: false,
          responseTime: responseTime,
          resultType,
          runLocation: record.location,
          sequenceId: record.sequenceid,
          startedAt: startedAt.toISOString(),
          stoppedAt: stoppedAt.toISOString(),
          id: record.id,
          accountId: accountId,
          checkId: record.checkid,
        };

        const parsed = JSON.parse(record.metadata);
        if (record.type === "API") {
          result.apiCheckResult = {
            assertions: parsed.assertions,
            request: parsed.request,
            response: {
              status: parsed.status,
              statusText: parsed.statusText,
              body: "",
              headers: {},
              timings: parsed.timingPhases,
              timingPhases: parsed.timingPhases,
            },
            requestError: parsed.requestError,
            jobLog: parsed.jobLog,
            jobAssets: parsed.jobAssets,
          };
        } else if (record.type === "BROWSER") {
          result.browserCheckResult = {
            errors: parsed.errors,
            jobLog: parsed.jobLog,
            playwrightTestTraces: parsed.playwrightTestTraces,
            playwrightTestJsonReportFile: parsed.playwrightTestJsonReportFile,
          };
        } else if (record.type === "MULTI_STEP") {
          result.multiStepCheckResult = {
            errors: parsed.errors,
            endTime: parsed.endTime,
            startTime: parsed.startTime,
            runtimeVersion: parsed.runtimeVersion,
            jobLog: parsed.jobLog,
            jobAssets: parsed.jobAssets,
            playwrightTestTraces: parsed.playwrightTestTraces,
            playwrightTestJsonReportFile: parsed.playwrightTestJsonReportFile,
          };
        }

        return result;
      });
  }

  private settleCheckIds(
    checkResults: Partial<CheckResult>[],
    externalIds: string[],
  ): string[] {
    const idsFromResults = checkResults.map((cr) => cr.checkId!);
    const allIds = [...idsFromResults, ...externalIds];
    return Array.from(new Set(allIds));
  }

  private async insertCheckResults(
    checkResults: Partial<CheckResult>[],
    from: Date,
    checkIds: string[],
    accountId: string,
  ) {
    const sorted = sortBy(checkResults, "startedAt");
    const groupedById = groupBy(sorted, "checkId");

    const newestRecordInBatch = new Date(
      new Date(sorted[sorted.length - 1].startedAt!).getTime() - 2 * 60_00,
    );
    for (const checkId of checkIds) {
      const resultsForCheck = groupedById[checkId] || [];
      await this.inserter.insertCheckResults(resultsForCheck as CheckResult[]);
      await this.inserter.trackCheckSyncStatus(
        checkId,
        accountId,
        from,
        newestRecordInBatch,
      );
    }
  }
}
