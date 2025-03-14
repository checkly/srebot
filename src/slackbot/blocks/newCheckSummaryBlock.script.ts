#! /usr/bin/env ts-node
import { WebClient } from "@slack/web-api";
import generateCheckSummaryBlock from "./newCheckSummaryBlock";

async function main() {
  [
    generateCheckSummaryBlock({
      checkId: "123",
      timeLocationSummary: "",
      checkName: "My Passing Check",
      checkSummary: "This is a summary of my passing check",
      checkState: "PASSING",
      lastFailure: new Date(),
      successRate: 100,
      failureCount: 0,
    }),
    generateCheckSummaryBlock({
      checkId: "123",
      timeLocationSummary: "",
      checkName: "My Flaky Check",
      checkSummary: "This is a summary of my flaky check",
      checkState: "FLAKY",
      lastFailure: new Date(),
      successRate: 0,
      failureCount: 10,
      failurePatterns: [
        "This is a failure pattern",
        "This is another failure pattern",
      ],
    }),
    generateCheckSummaryBlock({
      checkId: "123",
      timeLocationSummary: "",
      checkName: "My Check",
      checkSummary: "This is a summary of my check",
      checkState: "FAILING",
      lastFailure: new Date(),
      successRate: 0,
      failureCount: 10,
      failurePatterns: [
        "This is a failure pattern",
        "This is another failure pattern",
      ],
    }),
  ].forEach(async (block) => {
    const client = new WebClient(process.env.SLACK_AUTH_TOKEN);
    await client.chat.postMessage({
      channel: "C08E35FUB4L",
      blocks: block.blocks,
    });
  });
}

main();
