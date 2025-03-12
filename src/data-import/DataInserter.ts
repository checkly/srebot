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

export class CheckResultsInserter {
  private messageToClusterMap: Record<string, ErrorClusterTable>;
  private messageToEmbeddingMap: Record<string, number[]>;
  private embeddingModel: string;

  constructor() {
    this.messageToClusterMap = {};
    this.messageToEmbeddingMap = {};
    this.embeddingModel = "text-embedding-3-small";
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
    const chunkedCheckResults = chunk(checkResults, 100);
    for (const chunkOfResults of chunkedCheckResults) {
      await upsertCheckResults(chunkOfResults);

      const onlyFailing = chunkOfResults.filter(
        (cr) => cr.hasErrors || cr.hasFailures,
      );
      if (onlyFailing.length > 0) {
        await this.generateClustering(onlyFailing);
      }
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
      if (matchingCluster) {
        log.debug({ errorMessage }, "Found cached cluster");
      } else {
        matchingCluster = await findMatchingErrorCluster(
          checkly.accountId,
          embedding,
        );
        if (matchingCluster) {
          log.info(
            { ...matchingCluster, embedding: "[hidden]" },
            "Found matching error cluster in the DB",
          );
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
        log.info({ cluster: matchingCluster }, "New error cluster created");
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
          durationMs: startedAt - Date.now(),
        },
        "Generated new embeddings",
      );

      missingValues.forEach((value, index) => {
        this.messageToEmbeddingMap[value] = embeddings[index];
      });
    }
  }
}
