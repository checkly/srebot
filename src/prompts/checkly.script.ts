#! /usr/bin/env ts-node

import * as dataForge from "data-forge";
import "data-forge-fs";

import { findCheckResultsAggregated } from "../db/check-results";

import { config } from "dotenv";
import { resolve } from "path";
import { last24h } from "./checkly-data";
import { accountSummary } from "../slackbot/accountSummaryCommandHandler";
// Load environment variables from .env file
config({ path: resolve(__dirname, "../../.env") });

const accountId = process.env.CHECKLY_ACCOUNT_ID!;
console.log("ACCOUNT ID", accountId);

const checkId = "3fbcec6b-fba0-4ca6-bb2e-b7c64c2f1e9f";
console.log("CHECK ID", checkId);

const runLocation = "us-east-1";
console.log("RUN LOCATION", runLocation);

const now = new Date();
const from = new Date(
  now.getFullYear(),
  now.getMonth(),
  now.getDate() - 1,
  0,
  0,
  0,
);
const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
const interval = { from, to };
console.log("INTERVAL", interval);

async function main() {
  //todo make this a full blown checkly cli
  const accountSummaryResult = await accountSummary(accountId, interval);
  console.log(
    "ACCOUNT SUMMARY RESULT",
    JSON.stringify(accountSummaryResult, null, 2),
  );

  // const aggregatedCheckResults = await findCheckResultsAggregated({
  //   accountId: accountId,
  //   checkId: checkId,
  //   from: interval.from,
  //   to: interval.to,
  // });

  // const aggregatedCheckResultsInRegion = aggregatedCheckResults.filter(
  //   (r) => r.runLocation === runLocation,
  // );

  // const result = await summarizeCheckResultsToLabeledCheckStatus(
  //   aggregatedCheckResultsInRegion,
  // );

  // const serializedResult = result.toArray().map((r) => ({
  //   ...r,
  //   changePoints: JSON.stringify(r.changePoints),
  // }));
  // console.log(
  //   "SUMMARIZED CHECK RESULTS",
  //   JSON.stringify(serializedResult, null, 2),
  // );

  // const { text: summary } = await generateText(
  //   summarizeMultipleChecksStatus(result.toArray()),
  // );

  // console.log(
  //   result
  //     .toArray()
  //     .map((r) => JSON.stringify(r))
  //     .join("\n"),
  // );
  // console.log(summary);
}

main().then(() => {
  process.exit(0);
});
