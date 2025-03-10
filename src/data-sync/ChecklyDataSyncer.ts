import postgres from "../db/postgres";
import { checkly } from "../checkly/client";
import { CheckResult, CheckSyncStatus } from "../checkly/models";
import { log } from "../log";
import { insertChecks } from "../db/check";
import { insertCheckGroups } from "../db/check-groups";
import { chunk, keyBy } from "lodash";
import crypto from "node:crypto";
import {
  addMinutes,
  addSeconds,
  isAfter,
  isBefore,
  isEqual,
  subMinutes,
} from "date-fns";
import { getErrorMessageFromCheckResult } from "../prompts/checkly-data";
import {
  findMatchingErrorCluster,
  insertErrorCluster,
  insertErrorClusterMember,
} from "../db/error-cluster";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";

const SAFETY_MARGIN_MINUTES = 5;

export class ChecklyDataSyncer {
  constructor() {}

  async syncCheckResults({ from, to }: { from: Date; to: Date }) {
    const startedAt = Date.now();

    const allChecks = await checkly.getChecks();
    const groups = await checkly.getCheckGroups();
    const groupsById = keyBy(groups, "id");

    const checkIds = allChecks
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

    log.info({ checks_count: checkIds.length }, "Syncing check results");

    for (const checkId of checkIds) {
      const checkStartedAt = Date.now();
      await this.syncCheckResultsBetter(checkId, from, to);
      log.info(
        {
          duration_ms: Date.now() - checkStartedAt,
          checkId,
        },
        "Check results for check synced",
      );
    }
    log.info(
      {
        duration_ms: Date.now() - startedAt,
        checks_count: checkIds.length,
      },
      "All checks synced",
    );
  }

  private async syncCheckResultsBetter(checkId: string, from: Date, to: Date) {
    const periodsToSync = await this.getPeriodsToSync(checkId, from, to);
    const chunkedPeriods = periodsToSync.flatMap((period) =>
      this.divideIntoPeriodChunks(period.from, period.to, 60),
    );

    for (const period of chunkedPeriods) {
      await this.syncCheckResultsChunk(checkId, period.from, period.to);
      await this.trackCheckSyncStatus(
        checkId,
        checkly.accountId,
        period.from,
        period.to,
      );
    }
  }

  private getPeriodsToSync = async (
    checkId: string,
    from: Date,
    to: Date,
  ): Promise<{ from: Date; to: Date }[]> => {
    const checkSyncStatus = await postgres<CheckSyncStatus>("check_sync_status")
      .where({ checkId })
      .first();
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

  private trackCheckSyncStatus = async (
    checkId: string,
    accountId: string,
    from: Date,
    to: Date,
  ) => {
    await postgres<CheckSyncStatus>("check_sync_status")
      .insert({
        checkId,
        accountId,
        from, // Keep initial `from`
        to, // Update `to`
        syncedAt: new Date(),
      })
      .onConflict("checkId")
      .merge({
        to: postgres.raw("GREATEST(EXCLUDED.to, check_sync_status.to)"), // Keep the latest `to`
        syncedAt: postgres.fn.now(), // Always update `syncedAt`
      });
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
    const allChecks = await checkly.getChecks();

    await insertChecks(allChecks);

    // Remove checks that no longer exist
    const checkIds = allChecks.map((check) => check.id);
    await postgres("checks")
      .delete()
      .whereNotIn("id", checkIds)
      .where("accountId", checkly.accountId);

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
    await postgres("check_groups")
      .delete()
      .whereNotIn("id", groupIds)
      .where("accountId", checkly.accountId);

    log.info(
      {
        count: allGroups.length,
        duration_ms: Date.now() - startedAt,
      },
      "Check Groups synced",
    );
  }

  private serialiseCheckResultForDBInsert(result: CheckResult) {
    return {
      ...result,
      accountId: checkly.accountId,
      fetchedAt: new Date(),
    };
  }

  private async syncCheckResultsChunk(checkId: string, from: Date, to: Date) {
    const allCheckResults = await checkly.getCheckResultsByCheckId(checkId, {
      resultType: "ALL",
      from,
      to,
      hasFailures: true,
      limit: 100,
    });
    const allCheckResultsFromOldest = allCheckResults.reverse();
    if (allCheckResultsFromOldest.length === 0) {
      log.info({ checkId, from, to }, "No check results to sync");
      return;
    }

    const chunkedCheckResults = chunk(allCheckResultsFromOldest, 100);
    let insertedCount = 0;
    for (const chunkOfResults of chunkedCheckResults) {
      const enrichedResults = await Promise.all(
        chunkOfResults.map((result) => this.enrichResult(result)),
      );

      const mapped = enrichedResults.map((cr) =>
        this.serialiseCheckResultForDBInsert(cr),
      );
      await postgres("check_results").insert(mapped).onConflict("id").ignore();

      const onlyFailing = enrichedResults.filter(
        (cr) => cr.hasErrors || cr.hasFailures,
      );
      if (onlyFailing.length > 0) {
        await this.generateClustering(onlyFailing);
      }
      insertedCount += enrichedResults.length;
      log.debug(
        { insertedCount, checkId, periodTotal: chunkedCheckResults.length },
        "Inserted check results",
      );
    }
  }

  private async generateClustering(checkResults: CheckResult[]) {
    const errorMessages = checkResults.map(getErrorMessageFromCheckResult);
    const { embeddingModel, embeddings } =
      await this.generateEmbeddings(errorMessages);

    for (let i = 0; i < checkResults.length; i++) {
      const checkResult = checkResults[i];
      const errorMessage = errorMessages[i];
      const embedding = embeddings[i];

      // Find matching error cluster or create new one
      log.info({ errorMessage }, "Finding matching error cluster");
      let matchingCluster = await findMatchingErrorCluster(
        checkly.accountId,
        embedding,
      );

      if (!matchingCluster) {
        matchingCluster = {
          id: crypto.randomUUID(),
          account_id: checkly.accountId,
          error_message: errorMessage,
          first_seen_at: new Date(checkResult.created_at),
          last_seen_at: new Date(checkResult.created_at),
          embedding,
          embedding_model: embeddingModel,
        };
        await insertErrorCluster(matchingCluster);
        log.info({ cluster: matchingCluster }, "New error cluster created");
      }

      // Add this result to the cluster
      await insertErrorClusterMember({
        error_id: matchingCluster.id,
        result_check_id: checkResult.id,
        check_id: checkResult.checkId,
        date: new Date(checkResult.created_at),
        embedding,
        embedding_model: embeddingModel,
      });
    }
  }

  private async generateEmbeddings(values: string[]) {
    // 'embeddings' is an array of embedding objects (number[][]).
    // It is sorted in the same order as the input values.
    const embeddingModel = "text-embedding-3-small";
    const { embeddings } = await embedMany({
      model: openai.embedding(embeddingModel),
      values: values,
    });

    return { embeddingModel, embeddings };
  }
}
