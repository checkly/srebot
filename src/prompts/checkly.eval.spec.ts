import { generateText } from "ai";
import { Battle, Factuality, Possible, Summary } from "autoevals";
import dotenv from "dotenv";
import { CheckContext } from "src/aggregator/ContextAggregator";
import { getOpenaiSDKClient } from "src/ai/openai";
import { startLangfuseTelemetrySDK } from "../langfuse";
import { contextAnalysisSummaryPrompt } from "./checkly";
startLangfuseTelemetrySDK();

dotenv.config();

jest.setTimeout(120000); // Set timeout to 120 seconds

describe("Checkly Prompt Tests", () => {
  let openai;

  beforeAll(() => {
    openai = getOpenaiSDKClient();
  });

  it("should generate a concise and highly relevant summary", async () => {
    const contextRows = [
      {
        key: "checkly.alert",
        value:
          "API Latency Alert: /api/users endpoint p95 latency > 2000ms (threshold: 500ms)",
        checkId: "123",
        source: "checkly",
      },
      {
        key: "metrics.latency",
        value: "P95 latency increased from 200ms to 2500ms at 14:30 UTC",
        checkId: "123",
        source: "metrics",
      },
      {
        key: "database.metrics",
        value:
          "MongoDB read operations showing increased I/O wait times, averaging 1500ms per query",
        checkId: "123",
        source: "database",
      },
      {
        key: "system.logs",
        value:
          "High memory usage on database cluster primary node (92% utilized)",
        checkId: "123",
        source: "logs",
      },
      {
        key: "deployment.history",
        value:
          "Latest deployment at 14:15 UTC: Updated user authentication caching layer",
        checkId: "123",
        source: "deployment",
      },
      {
        key: "marketing.events",
        value: "New social media campaign launched at 13:00 UTC",
        checkId: "123",
        source: "marketing",
      },
      {
        key: "system.updates",
        value: "Routine security patches scheduled for next Tuesday",
        checkId: "123",
        source: "system",
      },
      {
        key: "network.status",
        value: "CDN edge node in Sydney reports optimal performance",
        checkId: "123",
        source: "network",
      },
      {
        key: "monitoring.alerts",
        value: "SSL certificate for dev.example.com expires in 25 days",
        checkId: "123",
        source: "monitoring",
      },
      {
        key: "system.disk",
        value: "Backup disk cleanup completed successfully, 234GB freed",
        checkId: "123",
        source: "system",
      },
    ] as CheckContext[];

    const [prompt, config] = contextAnalysisSummaryPrompt(contextRows);

    const { text: summary } = await generateText({
      ...config,
      prompt,
    });

    const expected =
      "Recent caching layer update (14:15 UTC) likely reduced cache efficiency, increasing load on MongoDB—reflected by a spike in p95 latency (200ms→2500ms) on /api/users, high I/O wait (1500ms/query), and 92% DB memory utilization. Mitigate by rolling back the caching change and scaling DB resources.";

    const expectedBad =
      "Summary: The /api/users endpoint now has latency around 2500ms (vs. 500ms threshold). It’s hard to pinpoint the exact cause because the caching layer update at 14:15 UTC might be partly responsible, but there are also confusing DB issues (92% memory usage and 1500ms I/O waits) and an overlapping marketing campaign that might be adding load. There’s uncertainty if rolling back the deployment will fix things, or if DB performance or external factors are to blame. Further ambiguous investigation is needed. Diff details: <link|Diff Details>.";

    const input =
      "Anaylze the context and generate a concise summary of the current situation.";

    const scores = await Promise.all([
      Possible({
        input: prompt,
        output: summary,
        expected: expected,
      }),
      Factuality({
        input: prompt,
        output: summary,
        expected: expected,
      }),
      Battle({
        instructions: prompt,
        output: summary,
        expected: expected,
      }),
      Summary({
        input: prompt,
        output: summary,
        expected: expectedBad,
      }),
    ]);

    expect(scores[0].score).toBe(1);
    expect(scores[1].score).toBeGreaterThan(0.5);
    expect(scores[2].score).toBeGreaterThan(0.5);
    expect(scores[3].score).toBeGreaterThan(0.5);
  });
});
