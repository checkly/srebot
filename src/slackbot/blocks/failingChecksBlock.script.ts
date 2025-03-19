#! /usr/bin/env ts-node

import { WebClient } from "@slack/web-api";
import { Check, renderFailingChecksBlock } from "./failingChecksBlock";

const channelId = process.env.SLACK_BOT_CHANNEL_ID!;

async function sendFailingChecksMessage() {
  const checksListSamples = [
    [
      {
        checkId: "123",
        checkState: "FAILED",
        name: "Check 1",
        failures: { total: 1, timeframe: "24h" },
        lastFailure: {
          checkResultId: "123",
          timestamp: new Date(),
        },
      } as Check,
      {
        checkId: "124",
        checkState: "PASSED",
        name: "Check 2",
        failures: { total: 0, timeframe: "24h" },
        group: "Group 2",
      } as Check,
      {
        checkId: "125",
        checkState: "DEGRADED",
        name: "Check 3",
        failures: { total: 2, timeframe: "24h" },
        group: "Group 3",
        lastFailure: {
          checkResultId: "125",
          timestamp: new Date(),
        },
      } as Check,
      {
        checkId: "126",
        checkState: "PASSED",
        name: "Check 4",
        failures: { total: 0, timeframe: "24h" },
        group: "Group 4",
      } as Check,
    ],
  ];

  const client = new WebClient(process.env.SLACK_AUTH_TOKEN);

  await Promise.all(
    checksListSamples.map(async (checks) => {
      const message = renderFailingChecksBlock(checks);

      await client.chat.postMessage({
        channel: channelId,
        text: "Failing Checks Summary",
        blocks: message.blocks,
      });
    }),
  );
}

sendFailingChecksMessage().catch(console.error);
