import { generateObject } from "ai";
import { AnswerRelevancy, Battle, Factuality, Possible } from "autoevals";
import dotenv from "dotenv";
import { getOpenaiSDKClient } from "src/ai/openai";
import { z } from "zod";
import { startLangfuseTelemetrySDK } from "../langfuse";
import { searchContextPrompt } from "./search";
startLangfuseTelemetrySDK();

dotenv.config();

jest.setTimeout(120000); // Set timeout to 120 seconds

describe("Context Search Prompt Tests", () => {
  let openai;

  beforeAll(() => {
    openai = getOpenaiSDKClient();
  });

  it("should be correct and relevant", async () => {
    const contextRows = [
      {
        key: "checkly.alert",
        value:
          "API Latency Alert: /api/users endpoint p95 latency > 2000ms (threshold: 500ms)",
      },
      {
        key: "metrics.latency",
        value: "P95 latency increased from 200ms to 2500ms at 14:30 UTC",
      },
      {
        key: "database.metrics",
        value:
          "MongoDB read operations showing increased I/O wait times, averaging 1500ms per query",
      },
      {
        key: "system.logs",
        value:
          "High memory usage on database cluster primary node (92% utilized)",
      },
      {
        key: "deployment.history",
        value:
          "Latest deployment at 14:15 UTC: Updated user authentication caching layer",
      },
      {
        key: "marketing.events",
        value: "New social media campaign launched at 13:00 UTC",
      },
      {
        key: "system.updates",
        value: "Routine security patches scheduled for next Tuesday",
      },
      {
        key: "network.status",
        value: "CDN edge node in Sydney reports optimal performance",
      },
      {
        key: "monitoring.alerts",
        value: "SSL certificate for dev.example.com expires in 25 days",
      },
      {
        key: "system.disk",
        value: "Backup disk cleanup completed successfully, 234GB freed",
      },
    ];

    const question =
      "What's causing the high latency in the /api/users endpoint?";

    const [prompt, config] = searchContextPrompt(question, contextRows);

    const { object: relevantContext } = await generateObject({
      output: "array",
      schema: z.object({
        relevance: z.number(),
        context: z.string(),
      }),
      ...config,
      prompt,
    });

    const expected = [
      {
        relevance: 1,
        context:
          "MongoDB read operations showing increased I/O wait times, averaging 1500ms per query",
      },
      {
        relevance: 1,
        context: "Memory usage on database cluster primary node (92% utilized)",
      },
      {
        relevance: 1,
        context:
          "Deployment of the user authentication caching layer at 14:15 UTC",
      },
    ];

    const scores = await Promise.all([
      Possible({
        input: question,
        output: JSON.stringify(relevantContext),
        expected: JSON.stringify(expected),
      }),
      Factuality({
        input: JSON.stringify(contextRows),
        output: JSON.stringify(relevantContext),
        expected: JSON.stringify(expected),
      }),
      AnswerRelevancy({
        input: question,
        output: JSON.stringify(relevantContext),
        context: JSON.stringify(contextRows),
      }),
      Battle({
        instructions: prompt,
        output: JSON.stringify(relevantContext),
        expected: JSON.stringify(expected),
      }),
    ]);

    expect(scores[0].score).toBe(1);
    expect(scores[1].score).toBeGreaterThan(0.6);
    expect(scores[2].score).toBeGreaterThan(0.6);
    expect(scores[3].score).toBeGreaterThan(0.6);
  });
});
