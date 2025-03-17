#! /usr/bin/env ts-node

import * as dataForge from "data-forge";
import "data-forge-fs";

import { findCheckResultsAggregated } from "../db/check-results";

import { config } from "dotenv";
import { resolve } from "path";
import { last24h } from "./checkly-data";
import { summarizeMultipleChecksStatus } from "./checkly";
import { summarizeCheckResultsToLabeledCheckStatus } from "../slackbot/check-results-labeled";
// Load environment variables from .env file
config({ path: resolve(__dirname, "../../.env") });

const accountId = process.env.CHECKLY_ACCOUNT_ID!;
console.log("ACCOUNT ID", accountId);

const interval = last24h(new Date());
console.log("INTERVAL", interval);

async function main() {
  const aggregatedCheckResults = await findCheckResultsAggregated({
    accountId: accountId,
    checkId: "d8b692a0-b0f2-43cf-9081-65ba0a0ec973",
    from: interval.from,
    to: interval.to,
  });

  console.log(new dataForge.DataFrame(aggregatedCheckResults).toString());

  const aggregatedCheckResultsInRegion = aggregatedCheckResults.filter(
    (r) => r.runLocation === "us-east-1",
  );

  const result = await summarizeCheckResultsToLabeledCheckStatus(
    aggregatedCheckResultsInRegion,
  );

  console.log(result.toString());

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
