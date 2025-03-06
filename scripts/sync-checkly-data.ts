#!/usr/bin/env node_modules/.bin/ts-node

import { openai } from "@ai-sdk/openai";
import { ChecklyDataSyncer } from "../src/data-sync/ChecklyDataSyncer";
import { getErrorMessageFromCheckResult } from "../src/prompts/checkly-data";
import {
  ErrorClusterTable,
  findMatchingErrorCluster,
  insertErrorCluster,
  insertErrorClusterMember,
} from "../src/db/error-cluster";
import { embedMany } from "ai";
import { checkly } from "../src/checkly/client";
import { log } from "../src/slackbot/log";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsedArgs: Record<string, string | boolean | number> = {};

  args.forEach((arg, index) => {
    if (arg.startsWith("--")) {
      const key = arg.replace(/^--/, "");
      const value = args[index + 1]?.startsWith("--")
        ? true
        : (args[index + 1] ?? true);
      parsedArgs[key] = isNaN(Number(value)) ? value : Number(value);
    }
  });

  return parsedArgs;
};

const showHelp = () => {
  console.log(`
Usage: ts-node sync-checkly-data.ts [options]

Options:
  --minutes-back <number>      Number of minutes back to sync (default: 10)
  --sync-check-results         Include check results in sync (default: false)
  --help                       Show this help message

Examples:
  ts-node sync-checkly-data.ts                           # Sync last 10 minutes (default), skip check results
  ts-node sync-checkly-data.ts --minutes-back 30          # Sync last 30 minutes, skip check results
  ts-node sync-checkly-data.ts --sync-check-results       # Sync last 10 minutes (default) and check results
  ts-node sync-checkly-data.ts --minutes-back 15 --sync-check-results  # Sync last 15 minutes and check results
`);
  process.exit(0);
};

const main = async () => {
  // parse arguments
  const args = parseArgs();

  if (args["help"]) {
    showHelp();
  }

  const minutesBack = args["minutes-back"] ? Number(args["minutes-back"]) : 10;
  const syncCheckResults = Boolean(args["sync-check-results"]);

  if (isNaN(minutesBack) || minutesBack <= 0) {
    console.error(
      "❌ Invalid argument. Please provide a positive number of minutes.",
    );
    process.exit(1);
  }

  console.log(`🔄 Syncing data from the last ${minutesBack} minutes...`);

  const daemon = new ChecklyDataSyncer();

  await daemon.syncChecks();
  await daemon.syncCheckGroups();

  if (syncCheckResults) {
    console.log("🔄 Syncing check results...");

    const checkResults = await daemon.syncCheckResults({
      from: minutesAgo(minutesBack),
      to: new Date(),
    });

    const errorMessages = checkResults.map(getErrorMessageFromCheckResult);
    const { embeddingModel, embeddings } =
      await generateEmbeddings(errorMessages);

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
        date: new Date(checkResult.created_at),
        embedding,
        embedding_model: embeddingModel,
      });
      log.info(
        { cluster: matchingCluster.id, checkResult: checkResult.id },
        "New error cluster member added",
      );
    }

    console.log("✅ Generated and stored embeddings for error messages");

    console.log("✅ Check results sync completed.");
  } else {
    console.log("⚠️ Skipping check results sync.");
  }

  console.log("✅ Sync completed.");
  process.exit(0);
};

function minutesAgo(minutesBack: number): Date {
  return new Date(Date.now() - minutesBack * 60 * 1000);
}

async function generateEmbeddings(values: string[]) {
  // 'embeddings' is an array of embedding objects (number[][]).
  // It is sorted in the same order as the input values.
  const embeddingModel = "text-embedding-3-small";
  const { embeddings } = await embedMany({
    model: openai.embedding(embeddingModel),
    values: values,
  });

  return { embeddingModel, embeddings };
}

main().catch((err) => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
