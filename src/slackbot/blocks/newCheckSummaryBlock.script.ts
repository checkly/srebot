#! /usr/bin/env ts-node
import { initConfig } from "../../lib/init-config";
import { WebClient } from "@slack/web-api";
import generateCheckSummaryBlock from "./newCheckSummaryBlock";

initConfig();

async function main() {
  [
    generateCheckSummaryBlock({
      errorPatterns: [],
      checkId: "123",
      failureAnalysis: "Everything looks super good",
      checkName: "My Passing Check",
      checkSummary: "This is a summary of my passing check",
      checkState: "PASSING",
      lastFailureAt: new Date(),
      successRate: 100,
      failureCount: 0,
    }),
    generateCheckSummaryBlock({
      checkId: "123",
      checkName: "My Flaky Check",
      checkSummary: "This is a summary of my flaky check",
      checkState: "FLAKY",
      lastFailureAt: new Date(),
      lastFailureId: "123",
      successRate: 0,
      failureCount: 10,
      failureAnalysis:
        "There was a brief failure in the 'us-east-1' region around 07:00, but it was resolved quickly. No ongoing issues are present",
      degradationsAnalysis:
        "Degradations appear consistently before failure events, with a total of 60 degradations, particularly increasing in us-east-1 before the failure at 07:00 UTC.",
      retriesAnalysis:
        "Retries significantly increase before failures, particularly in eu-west-1 from 08:00 to 15:00, with a total of 144 retries across all periods and regions.",
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
      checkName: "My Check",
      checkSummary: "This is a summary of my check",
      checkState: "FAILING",
      lastFailureAt: new Date(),
      successRate: 0,
      failureCount: 10,
      failureAnalysis:
        "There was a brief failure in the 'us-east-1' region around 07:00, but it was resolved quickly. No ongoing issues are present",
      degradationsAnalysis:
        "Degradations appear consistently before failure events, with a total of 60 degradations, particularly increasing in us-east-1 before the failure at 07:00 UTC.",
      retriesAnalysis:
        "Retries significantly increase before failures, particularly in eu-west-1 from 08:00 to 15:00, with a total of 144 retries across all periods and regions.",
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
    generateCheckSummaryBlock({
      checkId: "123",
      failureAnalysis: "No check runs",
      checkName: "My Check",
      checkSummary: "This is a summary of my check",
      checkState: "UNKNOWN",
      successRate: 0,
      failureCount: 0,
      errorPatterns: [],
    }),
  ].forEach(async (block) => {
    const client = new WebClient(process.env.SLACK_AUTH_TOKEN);
    await client.chat.postMessage({
      channel: "C088ANM1DD3",
      ...(block as any),
    });
  });
}

main();
