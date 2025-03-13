import { checkly } from "../checkly/client";
import { CheckResult } from "../checkly/models";
import { log } from "../log";
import { chunk } from "lodash";
import crypto from "node:crypto";
import { getErrorMessageFromCheckResult } from "../prompts/checkly-data";
import {
  ErrorClusterTable,
  findMatchingErrorCluster,
  insertErrorCluster,
  insertErrorClusterMember,
} from "../db/error-cluster";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { upsertCheckSyncStatus } from "../db/check-sync-status";
import { upsertCheckResults } from "../db/check-results";
import {
  bulkUpsertCheckResultsAggregated,
  CheckResultsAggregatedTable,
} from "../db/check-results-aggregated";

export class CheckResultsInserter {
  private messageToClusterMap: Record<string, ErrorClusterTable>;
  private messageToEmbeddingMap: Record<string, number[]>;
  private embeddingModel: string;
  private readonly aggregationBucketMinutes: number;

  constructor(
    props: { aggregationBucketMinutes: number } = {
      aggregationBucketMinutes: 30,
    },
  ) {
    this.messageToClusterMap = {};
    this.messageToEmbeddingMap = {};
    this.embeddingModel = "text-embedding-3-small";
    this.aggregationBucketMinutes = props.aggregationBucketMinutes;
  }

  async trackCheckSyncStatus(
    checkId: string,
    accountId: string,
    from: Date,
    to: Date,
  ) {
    await upsertCheckSyncStatus({
      checkId,
      accountId,
      from,
      to,
      syncedAt: new Date(),
    });
  }

  async insertCheckResults(checkResults: CheckResult[]) {
    const chunkedCheckResults = chunk(checkResults, 500); // Max batch size supported in knex insert is 1000
    for (const chunkOfResults of chunkedCheckResults) {
      const startedAt = Date.now();
      await upsertCheckResults(chunkOfResults);
      const insertDurationMs = Date.now() - startedAt;

      const aggregationStartedAt = Date.now();
      await this.saveAggregations(chunkOfResults);
      const aggregationDurationMs = Date.now() - aggregationStartedAt;

      const clusteringStartedAt = Date.now();
      const onlyFailing = chunkOfResults.filter(
        (cr) => cr.hasErrors || cr.hasFailures,
      );
      if (onlyFailing.length > 0) {
        await this.generateClustering(onlyFailing);
      }
      const clusteringDurationMs = Date.now() - clusteringStartedAt;
      log.debug(
        {
          batchSize: chunkOfResults.length,
          clusteringBatchSize: onlyFailing.length,
          durationMs: Date.now() - startedAt,
          insertDurationMs,
          aggregationDurationMs,
          clusteringDurationMs,
        },
        "batch inserted",
      );
    }
  }

  private async generateClustering(checkResults: CheckResult[]) {
    const errorMessages = checkResults.map(getErrorMessageFromCheckResult);
    await this.generateMissingEmbeddings(errorMessages);

    for (let i = 0; i < checkResults.length; i++) {
      const checkResult = checkResults[i];
      const errorMessage = errorMessages[i];
      const embedding = this.messageToEmbeddingMap[errorMessage];
      if (!embedding) {
        throw new Error(
          "Could not find an embedding in local map. This is a programmer error most likely",
        );
      }

      // Find matching error cluster or create new one
      let matchingCluster: ErrorClusterTable | null =
        this.messageToClusterMap[errorMessage] || null;
      if (!matchingCluster) {
        matchingCluster = await findMatchingErrorCluster(
          checkly.accountId,
          embedding,
        );
        if (matchingCluster) {
          // If a cluster was found in the DB we can cache it
          this.messageToClusterMap[errorMessage] = matchingCluster;
        }
      }

      if (!matchingCluster) {
        matchingCluster = {
          id: crypto.randomUUID(),
          account_id: checkly.accountId,
          error_message: errorMessage,
          first_seen_at: new Date(checkResult.startedAt),
          last_seen_at: new Date(checkResult.stoppedAt),
          embedding,
          embedding_model: this.embeddingModel,
        };
        await insertErrorCluster(matchingCluster);
        log.info("New error cluster created");
      }

      // Add this result to the cluster
      await insertErrorClusterMember({
        error_id: matchingCluster.id,
        result_check_id: checkResult.id,
        check_id: checkResult.checkId,
        date: new Date(checkResult.startedAt),
        embedding,
        embedding_model: this.embeddingModel,
      });
    }
  }

  private async generateMissingEmbeddings(values: string[]) {
    const uniqueValues: string[] = [...new Set(values)];
    const missingValues = uniqueValues.filter(
      (value) => !this.messageToEmbeddingMap[value],
    );

    if (missingValues.length > 0) {
      const startedAt = Date.now();
      const { embeddings } = await embedMany({
        model: openai.embedding(this.embeddingModel),
        values: missingValues,
      });
      log.debug(
        {
          missingEmbeddings: missingValues.length,
          durationMs: Date.now() - startedAt,
        },
        "Generated new embeddings",
      );

      missingValues.forEach((value, index) => {
        this.messageToEmbeddingMap[value] = embeddings[index];
      });
    }
  }

  private async saveAggregations(checkResults: CheckResult[]): Promise<void> {
    // Group aggregated data using a composite key.
    const aggregatedMap = new Map<string, CheckResultsAggregatedTable>();

    // Convert bucket size (in minutes) to milliseconds.
    const bucketMs = this.aggregationBucketMinutes * 60 * 1000;
    // Function to get the start of the bucket for a given Date.
    const getBucketStart = (date: Date): Date =>
      new Date(Math.floor(date.getTime() / bucketMs) * bucketMs);

    for (const result of checkResults) {
      // Use result.accountId if available, otherwise fallback to the accountId from the client.
      const accountId = result.accountId || checkly.accountId;
      const checkId = result.checkId;
      const location = result.runLocation;
      const startedAtDate = new Date(result.startedAt);
      const bucket = getBucketStart(startedAtDate);

      // Create a composite key for grouping: accountId, checkId, location, and bucket.
      const key = `${accountId}_${checkId}_${location}_${bucket.toISOString()}`;

      if (!aggregatedMap.has(key)) {
        aggregatedMap.set(key, {
          accountId,
          checkId,
          location,
          startedAtBucket: bucket,
          passingFinal: 0,
          failingFinal: 0,
          degradedFinal: 0,
          allFinal: 0,
          failingAttempt: 0,
          degradedAttempt: 0,
          allAttempt: 0,
        });
      }
      const aggregation = aggregatedMap.get(key)!;

      // Determine if the result is an attempt or final based on resultType.
      if (result.resultType === "FINAL") {
        aggregation.allFinal += 1;
        if (result.hasErrors || result.hasFailures) {
          aggregation.failingFinal += 1;
        } else if (result.isDegraded) {
          aggregation.degradedFinal += 1;
        } else {
          aggregation.passingFinal += 1;
        }
      } else if (result.resultType === "ATTEMPT") {
        aggregation.allAttempt += 1;
        if (result.hasErrors || result.hasFailures) {
          aggregation.failingAttempt += 1;
        } else if (result.isDegraded) {
          aggregation.degradedAttempt += 1;
        }
      }
    }

    // Convert the aggregation map to an array of aggregated records.
    const aggregatedRecords = Array.from(aggregatedMap.values());

    // Bulk upsert the aggregated records into the database.
    await bulkUpsertCheckResultsAggregated(aggregatedRecords);
  }
}
