import { expect, test } from "@jest/globals";
import { WebClient } from "@slack/web-api";
import { checkAttachment, summaryBlock } from "./blocks";

import dotenv from "dotenv";
dotenv.config();

describe("Slack Summary Message", () => {
  const authToken = process.env.SLACK_AUTH_TOKEN!;
  const channel = process.env.SLACK_BOT_CHANNEL_ID!;

  let slack: WebClient;

  beforeEach(() => {
    slack = new WebClient(authToken);
  });

  test("sends block message to channel successfully", async () => {
    const { text, blocks } = summaryBlock(1, 2, 3);
    await slack.chat.postMessage({
      channel,
      text,
      blocks: [
        ...blocks,
        ...checkAttachment({
          checkId: "e6922f63-a9a5-47bc-9ea5-c9271308f5b1",
          check: "[2024.02] API+scripts ❌",
          group: "Runtimes [All should be failing] ❌",
          type: "Browser",
          tags: ["tagA", "tagB"],
          success24h: 98,
          success7d: 99,
          timestamp: new Date(),
          location: "us-east-1",
          executionTime: 1.2,
          executionTimeAvg: 1.1,
          executionTimeP95: 1.4,
          executionTimeP99: 1.6,
        }).blocks,
        ...checkAttachment({
          checkId: "e3aeb9ea-909b-45fa-9083-ca00d0edc059",
          type: "Tcp",
          check: "[2024.02] API+scripts ❌",
          group: "Checkout",
          tags: ["tagA", "tagB", "tagB", "tagB", "tagB"],
          success24h: 98,
          success7d: 99,
          timestamp: new Date(),
          location: "us-east-1",
          executionTime: 1.2,
          executionTimeAvg: 1.1,
          executionTimeP95: 1.4,
          executionTimeP99: 1.6,
        }).blocks,
      ],
    });
  });
});
