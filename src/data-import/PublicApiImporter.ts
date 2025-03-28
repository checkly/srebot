import { checkly } from "../checkly/client";
import { Check, CheckResult } from "../checkly/models";
import { log } from "../log";
import {
  CheckTable,
  insertChecks,
  readChecksByAccountId,
  removeAccountChecks,
} from "../db/check";
import {
  insertCheckGroups,
  removeAccountCheckGroups,
} from "../db/check-groups";
import { chunk, keyBy } from "lodash";
import {
  addMinutes,
  addSeconds,
  isAfter,
  isBefore,
  isEqual,
  subMinutes,
} from "date-fns";
import { CheckResultsInserter } from "./DataInserter";
import { findCheckSyncStatus } from "../db/check-sync-status";

// This is how long back we will look for check results to sync from the latest "to" synced date
// Max check run duration is 4 minutes, so this adds a little margin
const SAFETY_MARGIN_MINUTES = 5;

export class PublicApiImporter {
  private inserter: CheckResultsInserter;
  private readonly accountId: string;

  constructor(props: { inserter?: CheckResultsInserter } = {}) {
    this.inserter = props.inserter || new CheckResultsInserter();
    this.accountId = checkly.accountId;
  }

  async syncCheckResults(minutesToSyncBack: number) {
    const startedAt = Date.now();

    const checkIds = await this.getCheckIdsToSync();
    log.info(
      { checks_count: checkIds.length, account_id: checkly.accountId },
      "Starting to sync check results",
    );

    let total = 0;
    for (const checkId of checkIds) {
      try {
        total += await this.syncResultsForCheck(checkId, minutesToSyncBack);
      } catch (err) {
        console.error(
          "Failed to sync check result for checkId: ",
          checkId,
          err,
        );
      }
    }
    log.info(
      {
        duration_ms: Date.now() - startedAt,
        checks_count: checkIds.length,
        total_check_results: total,
      },
      "Check results synced",
    );
  }

  private async getCheckIdsToSync(): Promise<string[]> {
    const allChecks = await checkly.getChecks();
    const groups = await checkly.getCheckGroups();
    const groupsById = keyBy(groups, "id");

    return allChecks
      .filter(
        (c) =>
          c.checkType === "API" ||
          c.checkType === "BROWSER" ||
          c.checkType === "MULTI_STEP",
      )
      .filter((c) => {
        if (c.groupId) {
          const group = groupsById[c.groupId];
          return group && group.activated && c.activated;
        }
        return c.activated;
      })
      .map((c) => c.id);
  }

  private async syncResultsForCheck(
    checkId: string,
    minutesBackToSync: number,
  ): Promise<number> {
    const to = new Date();
    const from = subMinutes(to, minutesBackToSync);

    const periodsToSync = await this.getPeriodsToSync(checkId, from, to);
    const chunkedPeriods = periodsToSync.flatMap((period) =>
      this.divideIntoPeriodChunks(period.from, period.to, 60),
    );

    let total = 0;
    for (const period of chunkedPeriods) {
      total += await this.syncCheckResultsChunk(
        checkId,
        period.from,
        period.to,
      );
      await this.inserter.trackCheckSyncStatus(
        checkId,
        checkly.accountId,
        period.from,
        period.to,
      );
    }

    return total;
  }

  private getPeriodsToSync = async (
    checkId: string,
    from: Date,
    to: Date,
  ): Promise<{ from: Date; to: Date }[]> => {
    const checkSyncStatus = await findCheckSyncStatus(checkId);
    // If no records exist, sync the entire period
    if (!checkSyncStatus) {
      return [{ from, to }];
    }

    const oldestRecordDate = checkSyncStatus.from;
    const latestSafeDate = subMinutes(new Date(), SAFETY_MARGIN_MINUTES);
    const newestRecordDate =
      checkSyncStatus?.to && checkSyncStatus.to <= latestSafeDate
        ? checkSyncStatus.to
        : latestSafeDate;

    if (isAfter(oldestRecordDate, newestRecordDate)) {
      return [{ from, to }];
    }

    const missingPeriods: { from: Date; to: Date }[] = [];

    // Case 1: If `from` is before `oldestRecordDate`, sync from `from` to `oldestRecordDate`
    if (from < oldestRecordDate) {
      missingPeriods.push({ from, to: oldestRecordDate });
    }

    // Case 2: If `to` is after `newestRecordDate`, sync from `newestRecordDate` to `to`
    if (to > newestRecordDate) {
      missingPeriods.push({ from: newestRecordDate, to });
    }

    // Case 3: If `from` is inside the existing synced range (between oldest & newest), and `to` is also inside
    // → Everything is already synced, return empty array
    if (from >= oldestRecordDate && to <= newestRecordDate) {
      return [];
    }

    return missingPeriods;
  };

  private divideIntoPeriodChunks(
    from: Date,
    to: Date,
    chunkMinutes: number,
  ): { from: Date; to: Date }[] {
    const chunks: { from: Date; to: Date }[] = [];
    let chunkStart = new Date(from);

    while (isBefore(chunkStart, to) || isEqual(chunkStart, to)) {
      let chunkEnd = addMinutes(chunkStart, chunkMinutes);

      // Ensure we don't exceed `to`
      if (isAfter(chunkEnd, to) || isEqual(chunkEnd, to)) {
        chunkEnd = new Date(to);
      }

      chunks.push({ from: chunkStart, to: chunkEnd });

      // Stop when we've reached `to`
      if (isEqual(chunkEnd, to)) break;

      // Move to the next chunk with a 1-second overlap
      chunkStart = addSeconds(chunkEnd, -1);
    }

    return chunks;
  }

  private async enrichResult(checkResult: CheckResult): Promise<CheckResult> {
    const isFailing = checkResult.hasErrors || checkResult.hasFailures;
    if (!isFailing) {
      return checkResult;
    }
    return checkly.getCheckResult(checkResult.checkId, checkResult.id);
  }

  async syncChecks() {
    const startedAt = Date.now();
    const [allChecks, checksForAccount] = await Promise.all([
      checkly.getChecks(),
      readChecksByAccountId(this.accountId),
    ]);
    const checkIds = allChecks.map((check) => check.id);
    const existingChecksById = keyBy(checksForAccount, "id");

    const checksForInsert = await this.prepareChecksForInsert(
      allChecks,
      existingChecksById,
    );

    await insertChecks(checksForInsert);

    // Remove checks that no longer exist
    await removeAccountChecks(checkIds, checkly.accountId);

    log.info(
      {
        count: allChecks.length,
        duration_ms: Date.now() - startedAt,
      },
      "Checks synced",
    );
  }

  async syncCheckGroups() {
    const startedAt = Date.now();

    const allGroups = await checkly.getCheckGroups();
    await insertCheckGroups(allGroups);

    // Remove checks that no longer exist
    const groupIds = allGroups.map((check) => check.id);
    await removeAccountCheckGroups(groupIds, checkly.accountId);

    log.info(
      {
        count: allGroups.length,
        duration_ms: Date.now() - startedAt,
      },
      "Check Groups synced",
    );
  }

  private async syncCheckResultsChunk(
    checkId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const allCheckResults = await checkly.getCheckResultsByCheckId(checkId, {
      resultType: "ALL",
      from,
      to,
      limit: 100,
    });
    const allCheckResultsFromOldest = allCheckResults.reverse();
    if (allCheckResultsFromOldest.length === 0) {
      return 0;
    }

    const chunkedCheckResults = chunk(allCheckResultsFromOldest, 100);
    let insertedCount = 0;
    for (const chunkOfResults of chunkedCheckResults) {
      const enrichedResults = await Promise.all(
        chunkOfResults.map((result) => this.enrichResult(result)),
      );

      await this.inserter.insertCheckResults(enrichedResults);
      insertedCount += enrichedResults.length;
    }

    return insertedCount;
  }

  private async prepareChecksForInsert(
    checksFromApi: Check[],
    checksFromDbById: Record<string, CheckTable>,
  ): Promise<
    (Check & {
      fetchedAt: Date;
    })[]
  > {
    const checkIdsToEnrich = checksFromApi
      .filter((check) => {
        const dbCheck = checksFromDbById[check.id];
        if (!dbCheck) {
          return true;
        }
        if (dbCheck.fetchedAt === null) {
          return true;
        }
        return isBefore(dbCheck.fetchedAt, check.updated_at);
      })
      .map((check) => check.id);

    log.debug(
      { size: checkIdsToEnrich.length },
      "Enriching checks with dependencies",
    );

    const checksWithDependencies = await Promise.all(
      checkIdsToEnrich.map((id) =>
        checkly.getCheck(id, { includeDependencies: true }),
      ),
    );

    return checksWithDependencies.map((check) => ({
      ...check,
      fetchedAt: new Date(),
    }));
  }
}
