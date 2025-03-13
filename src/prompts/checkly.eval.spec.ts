import path from "path";
import { readdirSync, readFileSync, statSync } from "fs";

import { generateObject, generateText } from "ai";
import dotenv from "dotenv";
import { CheckContext } from "../aggregator/ContextAggregator";
import { getOpenaiSDKClient } from "../ai/openai";

import {
  analyseCheckFailureHeatMap,
  contextAnalysisSummaryPrompt,
  summarizeErrorsPrompt,
  SummarizeErrorsPromptType,
  summarizeTestStepsPrompt,
} from "./checkly";
import { expect } from "@jest/globals";
import { Possible, Factuality, Battle, Summary } from "./toScoreMatcher";

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
        key: "checkly.check",
        value:
          '{"tags":[],"type":"BROWSER","checkId":"d6330bf8-1928-4953-9bc1-f4ac8d98f81f","frequency":10,"locations":["eu-central-1","eu-south-1"],"shouldFail":false,"retryStrategy":null,"sslCheckDomain":"","frequencyOffset":54,"maxResponseTime":30000}',
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
      {
        key: "checkly.script",
        value: `const { expect, test } = require('@playwright/test')

// Configure the Playwright Test timeout to 210 seconds,
// ensuring that longer tests conclude before Checkly's browser check timeout of 240 seconds.
// The default Playwright Test timeout is set at 30 seconds.
// For additional information on timeouts, visit: https://checklyhq.com/docs/browser-checks/timeouts/
test.setTimeout(210000)

// Set the action timeout to 10 seconds to quickly identify failing actions.
// By default Playwright Test has no timeout for actions (e.g. clicking an element).
test.use({ actionTimeout: 10000 })

test('visit page and take screenshot', async ({ page }) => {
  // Change checklyhq.com to your site's URL,
  // or, even better, define a ENVIRONMENT_URL environment variable
  // to reuse it across your browser checks
  const response = await page.goto(process.env.ENVIRONMENT_URL || 'https://checklyhq.com')

  // Take a screenshot
  await page.screenshot({ path: 'screenshot.jpg' })

  // Test that the response did not fail
  expect(response.status(), 'should respond with correct status code').toBeLessThan(400)
})
`,
        checkId: "123",
        source: "checkly",
      },
    ] as CheckContext[];

    const promptDef = contextAnalysisSummaryPrompt(contextRows);

    const { text: summary } = await generateText(promptDef);

    const expected =
      "Recent caching layer update (14:15 UTC) likely reduced cache efficiency, increasing load on MongoDB—reflected by a spike in p95 latency (200ms→2500ms) on /api/users, high I/O wait (1500ms/query), and 92% DB memory utilization. Mitigate by rolling back the caching change and scaling DB resources.";

    const expectedBad =
      "Summary: The /api/users endpoint now has latency around 2500ms (vs. 500ms threshold). It's hard to pinpoint the exact cause because the caching layer update at 14:15 UTC might be partly responsible, but there are also confusing DB issues (92% memory usage and 1500ms I/O waits) and an overlapping marketing campaign that might be adding load. There's uncertainty if rolling back the deployment will fix things, or if DB performance or external factors are to blame. Further ambiguous investigation is needed. Diff details: <link|Diff Details>.";

    const input =
      "Anaylze the context and generate a concise summary of the current situation.";

    return Promise.all([
      expect(summary).toScorePerfect(
        Possible({
          input,
          expected: expected,
        }),
      ),
      expect(summary).toScoreGreaterThanOrEqual(
        Factuality({
          input: promptDef.prompt!,
          expected: expected,
        }),
        0.5,
      ),
      expect(summary).toScoreGreaterThanOrEqual(
        Battle({
          instructions: promptDef.prompt!,
          expected: expected,
        }),
        0.5,
      ),
      expect(summary).toScorePerfect(
        Summary({
          input: promptDef.prompt!,
          expected: expectedBad,
        }),
      ),
    ]);
  });

  const ERROR_GOUP_TEST_DATA_PATH = path.join(
    __dirname,
    `checkly.eval.spec.fixtures/should\ find\ similar\ errors\ for\ check`,
  );
  const ERROR_GOUP_TEST_DATA_FOLDERS = readdirSync(ERROR_GOUP_TEST_DATA_PATH)
    .filter((file) => {
      const filePath = path.join(ERROR_GOUP_TEST_DATA_PATH, file);
      return statSync(filePath).isDirectory();
    })
    .map((checkFolder) => ({
      checkId: checkFolder,
      expected: JSON.parse(
        readFileSync(
          path.join(ERROR_GOUP_TEST_DATA_PATH, checkFolder, "expected.json"),
          "utf8",
        ),
      ),
      input: JSON.parse(
        readFileSync(
          path.join(
            ERROR_GOUP_TEST_DATA_PATH,
            checkFolder,
            "result-summary.json",
          ),
          "utf8",
        ),
      ),
    }));

  it.concurrent.each(ERROR_GOUP_TEST_DATA_FOLDERS)(
    "should find similar errors for check %s",
    async ({ checkId, input, expected }) => {
      input.results = input.results.map((result) => ({
        ...result,
        error: result.error?.message!,
      }));
      input.interval = {
        from: new Date(input.interval.from),
        to: new Date(input.interval.to),
      };

      const promptDef = summarizeErrorsPrompt(input);
      const { object: errorGroups } =
        await generateObject<SummarizeErrorsPromptType>(promptDef);

      errorGroups.groups.forEach((group) => {
        console.log(checkId, JSON.stringify(group, null, 2));
      });

      expect(errorGroups).toEqual(expected);
    },
  );

  it("should generate a feature coverage prompt", async () => {
    const { name, script, scriptPath } = {
      name: "Create Browser Check",
      script:
        "// import { test } from '@playwright/test'\nimport { expect, test } from '../../../../../../__checks__/helpers/checklyTest'\nimport { invokeFnAndWaitForResponse } from '../../../../../../__checks__/helpers/invokeFnAndWaitForResponse'\nimport { randomString } from '../../../../../../__checks__/helpers/randomString'\nimport { CheckBuilderHeaderPom } from '../../../../../components/checks/check-builder/__checks__/CheckBuilderHeaderPom'\nimport { BrowserCheckBuilderPom } from './pom/BrowserCheckBuilderPom'\n\ntest('should create browser check', async ({ page, webapp, api }) => {\n  await webapp.login()\n\n  const browserCheckBuilder = new BrowserCheckBuilderPom({ page, webapp })\n\n  await browserCheckBuilder.navigateToUsingSidebarCreateButton()\n\n  const checkName = `Check E2E test ${randomString()}`\n\n  const checkBuilderHeaderPom = new CheckBuilderHeaderPom({ page, webapp })\n  await checkBuilderHeaderPom.nameInput.fill(checkName)\n  await checkBuilderHeaderPom.activateCheckbox.uncheck({ force: true })\n\n  const createdCheck = await invokeFnAndWaitForResponse({\n    page,\n    urlMatcher: (url: string) => url.endsWith('/checks'),\n    method: 'POST',\n    status: 200,\n    fn: () => checkBuilderHeaderPom.saveButton.click(),\n  })\n\n  /**\n   * Wait until the browser check builder has loaded the check, otherwise it might get deleted via the API\n   * before the UI has a chance to refresh the create screen into the edit screen.\n   *\n   * The assertion here is a bit arbitrary (i.e. it could be any element on the edit screen).\n   */\n  await expect(page.getByText('Export to code')).toBeVisible()\n\n  api.checks.addToCleanupQueue(createdCheck.id)\n})\n",
      scriptPath:
        "src/pages/checks/browser/create/__checks__/create_check.spec.ts",
    };

    const errors = [
      'Error: Timed out 30000ms waiting for expect(locator).toHaveTitle(expected)\n\nLocator: locator(\':root\')\nExpected string: "New browser check"\nReceived string: "Create from scratch"\nCall log:\n  - expect.toHaveTitle with timeout 30000ms\n  - waiting for locator(\':root\')\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Dashboard"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Dashboard"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Dashboard"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n  -   locator resolved to <html lang="en">…</html>\n  -   unexpected value "Create from scratch"\n\n    at BrowserCheckBuilderPom.navigateToUsingSidebarCreateButton (/check/569270bb-6b06-4c38-9e4f-f2294953745f/src/pages/checks/browser/create/__checks__/pom/module.ts:38:25)\n    at /check/569270bb-6b06-4c38-9e4f-f2294953745f/src/pages/checks/browser/create/__checks__/create_check.spec.ts:13:31',
    ];

    const [prompt, config] = summarizeTestStepsPrompt(
      name,
      scriptPath,
      script,
      [],
      errors,
    );
    const { text: summary } = await generateText({
      ...config,
      prompt,
    });

    const expected = `
        1. User logs into the application.
        2. Navigate to create new check.
        3. Enter name for browser check.
        4. Deselect activate for new check.
        5. Save the new browser check.

    **Failure Occurred At:** Step 2: Navigate to create new check. The error happened while trying to navigate, as evident by the unresolved title "New browser check". This indicates a navigation issue, possibly remaining on the "Create from scratch" page instead.`;
    const input = JSON.stringify({
      name,
      scriptPath,
      script,
      errors,
    });

    return Promise.all([
      expect(summary).toScorePerfect(
        Possible({
          input,
          expected: expected,
        }),
      ),
      expect(summary).toScoreGreaterThanOrEqual(
        Factuality({
          input: prompt,
          expected: expected,
        }),
        0.5,
      ),
      expect(summary).toScoreGreaterThanOrEqual(
        Battle({
          instructions: prompt,
          expected: expected,
        }),
        0.5,
      ),
    ]);
  });
});

describe("Checkly Prompt Tests", () => {
  it("should categorise a sample heatmap correctly - heatmap-001.png", async () => {
    const buffer = readFileSync(
      path.join(
        __dirname,
        "checkly.eval.spec.fixtures/heatmaps/heatmap-001.png",
      ),
    );
    const config = analyseCheckFailureHeatMap(buffer);
    const { object } = await generateObject({
      ...config,
    });

    expect(object.category).toEqual("FLAKY");

    const expected = `The flakiness affects both (us-east-1, and eu-west-1) regions intermittently throughout the last 24h`;
    const input = `Where and when did the failures occur in the last 24 hours?`;

    return Promise.all([
      expect(object.failureIncidentsSummary).toScorePerfect(
        Possible({
          input,
          expected: expected,
        }),
      ),
      expect(object.failureIncidentsSummary).toScoreGreaterThanOrEqual(
        Factuality({
          input,
          expected: expected,
        }),
        0.5,
      ),
    ]);
  });

  it("should categorise a sample heatmap correctly - heatmap-002.png", async () => {
    const buffer = readFileSync(
      path.join(
        __dirname,
        "checkly.eval.spec.fixtures/heatmaps/heatmap-002.png",
      ),
    );
    const config = analyseCheckFailureHeatMap(buffer);
    const { object } = await generateObject({
      ...config,
    });

    expect(object.category).toEqual("FAILING");

    const expected = `Failures affected both location (eu-west-1) and (eu-central-1). There were two periods of failures, one early in the night around 3 and one in the afternoon until now (ongoing)`;
    const input = `Where and when did the failures occur in the last 24 hours? The input is a heatmap image of a check running in eu-west-1 and eu-central-1. The timestamps may be off by 30 minutes`;

    return Promise.all([
      expect(object.failureIncidentsSummary).toScorePerfect(
        Possible({
          input,
          expected: expected,
        }),
      ),
      expect(object.failureIncidentsSummary).toScoreGreaterThanOrEqual(
        Factuality({
          input,
          expected: expected,
        }),
        0.2,
      ),
    ]);
  });
});
