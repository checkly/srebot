import { checkly } from "../checkly/client";
import { CheckResult } from "../checkly/models";
import { log } from "../log";
import { chunk } from "lodash";
import crypto from "node:crypto";
import { getErrorMessageFromCheckResult } from "../prompts/checkly-data";
import {
  findMatchingErrorCluster,
  insertErrorCluster,
  insertErrorClusterMember,
} from "../db/error-cluster";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { upsertCheckSyncStatus } from "../db/check-sync-status";
import { upsertCheckResults } from "../db/check-results";

export class CheckResultsInserter {
  constructor() {}

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
          first_seen_at: new Date(checkResult.startedAt),
          last_seen_at: new Date(checkResult.stoppedAt),
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
        date: new Date(checkResult.startedAt),
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
