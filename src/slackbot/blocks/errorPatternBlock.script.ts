#!/usr/bin/env ts-node

import { WebClient } from "@slack/web-api";
import { createErrorPatternsBlock } from "./errorPatternBlock";

async function main() {
  console.log("Sending empty error patterns...");
  const messages = [
    createErrorPatternsBlock([]),
    createErrorPatternsBlock([
      {
        id: "123",
        error_message: "Error Pattern #1\nDetails of error pattern #1",
        count: 10,
        first_seen_at: new Date(),
        last_seen_at: new Date(),
        embedding: [],
        embedding_model: "model",
        account_id: "account1",
      },
    ]),
    createErrorPatternsBlock([
      {
        id: "123",
        error_message: "Error Pattern #1\nDetails of error pattern #1",
        count: 10,
        first_seen_at: new Date(),
        last_seen_at: new Date(),
        embedding: [],
        embedding_model: "model",
        account_id: "account1",
      },
      {
        id: "124",
        error_message: "Error Pattern #2\nDetails of error pattern #2",
        count: 20,
        first_seen_at: new Date(),
        last_seen_at: new Date(),
        embedding: [],
        embedding_model: "model",
        account_id: "account2",
      },
    ]),
  ];

  const client = new WebClient(process.env.SLACK_AUTH_TOKEN);

  for (const blocks of messages) {
    await client.chat.postMessage({
      channel: process.env.SLACK_BOT_CHANNEL_ID!,
      blocks: blocks.blocks,
    });
  }
}

main();
