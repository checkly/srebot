#! /usr/bin/env ts-node

import { generateObject, generateText } from "ai";
import * as dataForge from "data-forge";
import "data-forge-fs";

import { findCheckResultsByAccountId } from "../db/check-results";

import { config } from "dotenv";
import { resolve } from "path";
import { last24h } from "./checkly-data";
import { summarizeMultipleChecksStatus } from "./checkly";
import { summarizeCheckResultsToLabeledCheckStatus } from "../slackbot/checkly";
// Load environment variables from .env file
config({ path: resolve(__dirname, "../../.env") });

const accountId = process.env.CHECKLY_ACCOUNT_ID!;
console.log("ACCOUNT ID", accountId);

const interval = last24h(new Date());
console.log("INTERVAL", interval);

async function main() {
  const checkResults = await findCheckResultsByAccountId(
    accountId,
    interval.from,
    interval.to,
  );

  const result = await summarizeCheckResultsToLabeledCheckStatus(checkResults);

  console.log("RESULT", result.toArray().length);

  const { text: summary } = await generateText(
    summarizeMultipleChecksStatus(result.toArray()),
  );

  console.log(
    result
      .toArray()
      .map((r) => JSON.stringify(r))
      .join("\n"),
  );
  console.log(summary);
}

main().then(() => {
  process.exit(0);
});
