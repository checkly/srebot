#!/usr/bin/env node_modules/.bin/ts-node

import { CheckResult } from "../checkly/models";
import { db } from "../db/connection";
import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { getErrorMessageFromCheckResult } from "../prompts/checkly-data";

function formatEmbeddingForPg(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

async function generateEmbeddings(values: string[]) {
  // 'embeddings' is an array of embedding objects (number[][]).
  // It is sorted in the same order as the input values.
  const { embeddings } = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: values,
  });

  return embeddings;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

interface ErrorCluster {
  representative: {
    error: string;
    checkResult: CheckResult;
  };
  similar: Array<{
    error: string;
    checkResult: CheckResult;
    similarity: number;
  }>;
}

function clusterErrors(
  errors: string[],
  embeddings: number[][],
  checkResults: CheckResult[],
  similarityThreshold = 0.85,
): ErrorCluster[] {
  const clusters: ErrorCluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < errors.length; i++) {
    if (used.has(i)) continue;

    const cluster: ErrorCluster = {
      representative: {
        error: errors[i],
        checkResult: checkResults[i],
      },
      similar: [],
    };

    // Find similar errors
    for (let j = 0; j < errors.length; j++) {
      if (i === j || used.has(j)) continue;

      const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
      if (similarity >= similarityThreshold) {
        cluster.similar.push({
          error: errors[j],
          checkResult: checkResults[j],
          similarity,
        });
        used.add(j);
      }
    }

    if (cluster.similar.length > 0) {
      clusters.push(cluster);
      used.add(i);
    }
  }

  return clusters;
}

async function main() {
  const failedChecksQueryResult = await db("check_results")
    .where("has_failures", true)
    .orWhere("has_errors", true)
    .orderBy("created_at", "desc");

  // Convert DB results to CheckResult objects
  const failedChecks = failedChecksQueryResult.map((result) => ({
    id: result.id,
    name: result.name,
    checkId: result.check_id,
    hasFailures: result.has_failures,
    hasErrors: result.has_errors,
    isDegraded: result.is_degraded,
    overMaxResponseTime: result.over_max_response_time,
    runLocation: result.run_location,
    startedAt: result.started_at,
    stoppedAt: result.stopped_at,
    created_at: result.created_at,
    responseTime: result.response_time,
    apiCheckResult: result.api_check_result,
    browserCheckResult: result.browser_check_result,
    multiStepCheckResult: result.multi_step_check_result,
    checkRunId: result.check_run_id,
    attempts: result.attempts,
    resultType: result.result_type,
    sequenceId: result.sequence_id,
  })) as CheckResult[];

  const errors = failedChecks.map((cr) => getErrorMessageFromCheckResult(cr));
  const embeddings = await generateEmbeddings(errors);

  // Cluster the errors
  const clusters = clusterErrors(errors, embeddings, failedChecks);

  // Store clusters and their relationships
  for (const cluster of clusters) {
    // Insert the cluster
    const [{ id: clusterId }] = await db("error_clusters")
      .insert({
        name: `Error Pattern: ${cluster.representative.error.slice(0, 50)}...`,
        error_pattern: cluster.representative.error,
        metadata: {
          check_id: cluster.representative.checkResult.checkId,
        },
        occurrence_count: cluster.similar.length + 1,
        first_seen: cluster.representative.checkResult.startedAt,
        last_seen:
          cluster.similar.length > 0
            ? cluster.similar[cluster.similar.length - 1].checkResult.startedAt
            : cluster.representative.checkResult.startedAt,
        embedding: db.raw(`?::vector`, [
          formatEmbeddingForPg(
            embeddings[
              failedChecks.indexOf(cluster.representative.checkResult)
            ],
          ),
        ]),
      })
      .returning("id");

    // Insert the representative check result relationship
    await db("error_cluster_members").insert({
      cluster_id: clusterId,
      check_result_id: cluster.representative.checkResult.id,
      similarity: 1.0,
    });

    // Insert relationships for similar errors
    await Promise.all(
      cluster.similar.map((similar) =>
        db("error_cluster_members").insert({
          cluster_id: clusterId,
          check_result_id: similar.checkResult.id,
          similarity: similar.similarity,
        }),
      ),
    );

    console.log(
      `Stored cluster ${clusterId} with ${cluster.similar.length + 1} members`,
    );
  }

  console.log(`Stored ${clusters.length} clusters in the database`);
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
