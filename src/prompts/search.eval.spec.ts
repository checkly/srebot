import { generateObject } from "ai";
import dotenv from "dotenv";
import { getOpenaiSDKClient } from "../ai/openai";
import { z } from "zod";
import { startLangfuseTelemetrySDK } from "../langfuse";
import { searchContextPrompt } from "./search";
import { expect } from "@jest/globals";
import {
  Possible,
  Factuality,
  AnswerRelevancy,
  Battle,
} from "./toScoreMatcher";
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

    const input = "What's causing the high latency in the /api/users endpoint?";

    const [prompt, config] = searchContextPrompt(input, contextRows);

    const { object: relevantContext } = await generateObject({
      output: "array",
      schema: z.object({
        relevance: z.number(),
        context: z.string(),
      }),
      ...config,
      prompt,
    });
    const output = JSON.stringify(relevantContext);

    const expected = JSON.stringify([
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
    ]);

    return Promise.all([
      expect(output).toScorePerfect(
        Possible({
          input,
          expected,
        }),
      ),
      expect(output).toScoreGreaterThanOrEqual(
        Factuality({
          input,
          expected,
        }),
        0.6,
      ),
      expect(output).toScoreGreaterThanOrEqual(
        AnswerRelevancy({
          input,
          expected,
        }),
        0.6,
      ),
      expect(output).toScoreGreaterThanOrEqual(
        Battle({
          instructions: prompt,
          expected,
        }),
        0.6,
      ),
    ]);
  });
});
