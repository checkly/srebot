import { generateText } from "ai";
import dotenv from "dotenv";
import { getOpenaiSDKClient } from "../ai/openai";
import { startLangfuseTelemetrySDK } from "../langfuse";
import { alertHistoryPrompt } from "./alerts";
import { expect } from "@jest/globals";
import { Summary, Possible, Factuality, Battle } from "./toScoreMatcher";
import { OpenAIProvider } from "@ai-sdk/openai";

startLangfuseTelemetrySDK();
dotenv.config();

jest.setTimeout(120000);

describe("Alert History Prompt Tests", () => {
  let openai: OpenAIProvider;

  beforeAll(() => {
    openai = getOpenaiSDKClient();
  });

  it("should correctly identify recurring alert patterns", async () => {
    // Mock message history in exact format from analyze-alert.ts
    const messageHistory = `<message>2024-02-13T10:00:00.000Z Slack link: https://company.slack.com/archives/C123456/p1644743400 Text: 🚨 API Latency Alert: /api/users p95 latency > 2000ms in us-east-1</message>
<message>2024-02-13T10:30:00.000Z Slack link: https://company.slack.com/archives/C123456/p1644744900 Text: ✅ API Latency Alert: /api/users recovered in us-east-1</message>
<message>2024-02-13T11:00:00.000Z Slack link: https://company.slack.com/archives/C123456/p1644746400 Text: 🚨 API Latency Alert: /api/users p95 latency > 2000ms in us-east-1</message>`;

    const alertMessage =
      "API Latency Alert: /api/users p95 latency > 2000ms in us-east-1";

    const [prompt, config] = alertHistoryPrompt(alertMessage, messageHistory);

    const { text: analysis } = await generateText({
      ...config,
      prompt,
    });

    const expected = {
      type: "recurring",
      reasoning:
        "The alert has occurred multiple times in the last 72h, with a clear pattern of failure and recovery. The same API endpoint is experiencing intermittent latency issues.",
      confidence: 95,
      pastMessageLinks: [
        "https://company.slack.com/archives/C123456/p1644743400",
        "https://company.slack.com/archives/C123456/p1644746400",
      ],
    };

    return Promise.all([
      expect(analysis).toScorePerfect(
        Summary({
          input: messageHistory,
          expected: JSON.stringify(expected),
        }),
      ),
      expect(analysis).toScoreGreaterThanOrEqual(
        Factuality({
          input: messageHistory,
          expected: JSON.stringify(expected),
        }),
        0.6,
      ),
      expect(analysis).toScoreGreaterThanOrEqual(
        Battle({
          instructions: prompt,
          expected: JSON.stringify(expected),
        }),
        0.6,
      ),
    ]);
  });

  it("should correctly identify escalating alert patterns", async () => {
    const messageHistory = `<message>2024-02-13T10:00:00.000Z Slack link: https://company.slack.com/archives/C123456/p1644743400 Text: 🚨 API Latency Alert: /api/users p95 latency > 1000ms in us-east-1</message>
<message>2024-02-13T10:30:00.000Z Slack link: https://company.slack.com/archives/C123456/p1644744900 Text: 🚨 API Latency Alert: /api/users p95 latency > 1500ms in us-east-1</message>
<message>2024-02-13T11:00:00.000Z Slack link: https://company.slack.com/archives/C123456/p1644746400 Text: 🚨 API Latency Alert: /api/users p95 latency > 2000ms in us-east-1</message>`;

    const alertMessage =
      "API Latency Alert: /api/users p95 latency > 2500ms in us-east-1";

    const [prompt, config] = alertHistoryPrompt(alertMessage, messageHistory);

    const { text: analysis } = await generateText({
      ...config,
      prompt,
    });

    const expected = {
      type: "escalating",
      reasoning:
        "The alert shows a clear pattern of escalation with latency progressively increasing from 1000ms to 2500ms over the past 72h.",
      confidence: 90,
      pastMessageLinks: [
        "https://company.slack.com/archives/C123456/p1644743400",
        "https://company.slack.com/archives/C123456/p1644744900",
        "https://company.slack.com/archives/C123456/p1644746400",
      ],
    };

    return Promise.all([
      expect(analysis).toScorePerfect(
        Summary({
          input: messageHistory,
          expected: JSON.stringify(expected),
        }),
      ),
      expect(analysis).toScoreGreaterThanOrEqual(
        Factuality({
          input: messageHistory,
          expected: JSON.stringify(expected),
        }),
        0.6,
      ),
      expect(analysis).toScoreGreaterThanOrEqual(
        Battle({
          instructions: prompt,
          expected: JSON.stringify(expected),
        }),
        0.6,
      ),
    ]);
  });

  it("should correctly identify new alerts", async () => {
    const messageHistory = `<message>2024-02-13T10:00:00.000Z Slack link: https://company.slack.com/archives/C123456/p1644743400 Text: 🚨 Database CPU Usage Alert: Primary DB cluster at 85% CPU</message>
<message>2024-02-13T10:30:00.000Z Slack link: https://company.slack.com/archives/C123456/p1644744900 Text: ✅ SSL Certificate Alert: cert.example.com expires in 20 days</message>`;

    const alertMessage =
      "API Latency Alert: /api/users p95 latency > 2000ms in us-east-1";

    const [prompt, config] = alertHistoryPrompt(alertMessage, messageHistory);

    const { text: analysis } = await generateText({
      ...config,
      prompt,
    });

    const expected = {
      type: "new",
      reasoning:
        "This is the first occurrence of an API latency alert for the /api/users endpoint in the last 72h. Previous alerts in the channel were unrelated (database CPU and SSL certificates).",
      confidence: 95,
      pastMessageLinks: [],
    };

    return Promise.all([
      expect(analysis).toScorePerfect(
        Summary({
          input: messageHistory,
          expected: JSON.stringify(expected),
        }),
      ),
      expect(analysis).toScoreGreaterThanOrEqual(
        Factuality({
          input: messageHistory,
          expected: JSON.stringify(expected),
        }),
        0.6,
      ),
      expect(analysis).toScoreGreaterThanOrEqual(
        Battle({
          instructions: prompt,
          expected: JSON.stringify(expected),
        }),
        0.6,
      ),
    ]);
  });
});
