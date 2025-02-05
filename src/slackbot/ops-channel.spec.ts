import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import dotenv from "dotenv";
import "dotenv/config";
import "reflect-metadata";
import { generateChannelSummary } from "./channel-summary";
import { convertSlackTimestamp, fetchHistoricalMessages } from "./utils";

dotenv.config();
jest.setTimeout(30000);

// Playground for testing the channel summary

describe.skip("fetchHistoricalMessages", () => {
  it("should fetch historical messages", async () => {
    const messages = await fetchHistoricalMessages("CUZ7V5YKZ");
  });

  it("should generate a summary", async () => {
    const opsMessages = (await fetchHistoricalMessages("CUZ7V5YKZ", 100)) ?? [];
    const deploymentMessages =
      (await fetchHistoricalMessages("C046EHXJCFM", 100)) ?? [];

    const messages = [...opsMessages, ...deploymentMessages].sort((a, b) => {
      return (
        convertSlackTimestamp(b.ts!).getTime() -
        convertSlackTimestamp(a.ts!).getTime()
      );
    });

    const messageHistory = messages
      ?.map(
        (m) =>
          `${convertSlackTimestamp(m.ts!).toISOString()} Message: ${
            m.plaintext
          }`
      )
      .join("\n");

    const { text } = await generateText({
      model: openai("o1-preview"),
      prompt: `You are a ops channel bot that is part of the incident response team. Given the message history in the channel, your job is to respond to the trigger message with a concise breakdown.

  Objectives:
  - Check if the issue has happened before
  - Review and analyze the message history to determine if there are any relations to the trigger message
  - Generate a helpful response that helps first time responders
  - Keep it highly relevant
  - Be very concise and to the point
  - A valid response should be 1-2 sentences
  - Be upfront and direct. If the message does not need any intervention, just say so
  - If there is no issue, just say so
  - Respond only to the trigger message
  - Only propose actions if there is a real issue

  Message History:\n${messageHistory}

  Question: is anything related to the recent adhocrun-eu-west-1 check failing?`,
      experimental_telemetry: {
        isEnabled: true,
      },
    });

    console.log(text);
  });
  it("should generateChannelSummary", async () => {
    const summary = await generateChannelSummary(
      "CUZ7V5YKZ",
      "Create a concise summary recent alerts and notifications."
    );
    console.log(summary);
  });
});
