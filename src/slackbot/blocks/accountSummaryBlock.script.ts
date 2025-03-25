#! /usr/bin/env ts-node
import { WebClient } from "@slack/web-api";
import { createAccountSummaryBlock } from "./accountSummaryBlock";

async function main() {
  const testCases = [
    // All good
    createAccountSummaryBlock({
      accountName: "Healthy",
      passingChecks: 50,
      degradedChecks: 0,
      failingChecks: 0,
      passingChecksDelta: 1,
      degradedChecksDelta: 0,
      failingChecksDelta: -1,
      hasIssues: false,
      issuesSummary: "No issues detected in the last 24h.",
      failingChecksGoals: "No failing checks detected in the last 24h.",
      failingCheckIds: [],
      errorPatterns: [],
    }),
    // Some degraded
    createAccountSummaryBlock({
      accountName: "Degraded",
      passingChecks: 45,
      degradedChecks: 5,
      failingChecks: 0,
      passingChecksDelta: 100,
      degradedChecksDelta: -100,
      failingChecksDelta: 0,
      hasIssues: true,
      issuesSummary:
        "New degrading or failing checks detected in the last 24h.",
      failingChecksGoals: "No failing checks detected in the last 24h.",
      failingCheckIds: [],
      errorPatterns: [
        {
          id: "123",
          description: "Error Pattern #1",
          count: 10,
        },
        {
          id: "124",
          description: "Error Pattern #2",
          count: 99,
        },
        {
          id: "125",
          description: "Error Pattern #3",
          count: 10,
        },
      ],
    }),
    // Failing checks without error patterns
    createAccountSummaryBlock({
      accountName: "FailingNoErrors",
      passingChecks: 42,
      degradedChecks: 3,
      failingChecks: 5,
      passingChecksDelta: 0,
      degradedChecksDelta: 0,
      failingChecksDelta: 0,
      hasIssues: true,
      issuesSummary:
        "New degrading or failing checks detected in the last 24h.",
      failingChecksGoals: "Some checks have failed in the last 24h.",
      failingCheckIds: ["126", "127", "128", "129", "130"],
      errorPatterns: [],
    }),
    // Some failing
    createAccountSummaryBlock({
      accountName: "Failing",
      passingChecks: 40,
      degradedChecks: 2,
      failingChecks: 8,
      passingChecksDelta: -5,
      degradedChecksDelta: 0,
      failingChecksDelta: +5,
      hasIssues: true,
      issuesSummary:
        "New degrading or failing checks detected in the last 24h.",
      failingChecksGoals: "No failing checks detected in the last 24h.",
      failingCheckIds: ["123", "124", "125"],
      errorPatterns: [
        {
          id: "123",
          description: "Error Pattern #1",
          count: 10,
        },
      ],
    }),
  ];

  const client = new WebClient(process.env.SLACK_AUTH_TOKEN);

  for (const blocks of testCases) {
    await client.chat.postMessage({
      channel: process.env.SLACK_BOT_CHANNEL_ID!,
      blocks: blocks.blocks,
    });
  }
}

main().catch(console.error);
