#! /usr/bin/env ts-node
import { WebClient } from "@slack/web-api";
import generateCheckSummaryBlock from "./newCheckSummaryBlock";

async function main() {
  [
    generateCheckSummaryBlock({
      errorPatterns: [],
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
      errorPatterns: [
        {
          description: "This is a failure pattern",
          count: 5553,
          id: "123",
          firstSeenAt: new Date(
            Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
          ),
        },
        {
          description: "This is another failure pattern",
          count: 123,
          id: "511",
          firstSeenAt: new Date(
            Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
          ),
        },
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
      errorPatterns: [
        {
          description: "This is a failure pattern",
          count: 11,
          id: "123",
          firstSeenAt: new Date(
            Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
          ),
        },
        {
          description: "This is another failure pattern",
          count: 12,
          id: "511",
          firstSeenAt: new Date(
            Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
          ),
        },
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
