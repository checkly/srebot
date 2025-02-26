import fs from "fs";

import { generateObject, generateText } from "ai";
import dotenv from "dotenv";
import { CheckContext } from "../aggregator/ContextAggregator";
import { getOpenaiSDKClient } from "../ai/openai";
import { startLangfuseTelemetrySDK } from "../langfuse";
import {
  clusterCheckResults,
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
          input: promptDef.prompt,
          expected: expected,
        }),
        0.5,
      ),
      expect(summary).toScoreGreaterThanOrEqual(
        Battle({
          instructions: promptDef.prompt,
          expected: expected,
        }),
        0.5,
      ),
      expect(summary).toScorePerfect(
        Summary({
          input: promptDef.prompt,
          expected: expectedBad,
        }),
      ),
    ]);
  });

  const ERROR_GOUP_TEST_DATA: {
    checkId: string;
    expected: SummarizeErrorsPromptType;
  }[] = [
    {
      checkId: "3c4264bc-4355-4f7f-ba6c-5d79a647e0bc",
      expected: {
        groups: [
          {
            errorMessage:
              "Error: Timed out 30000ms waiting for expect(locator).toBeVisible()",
            checkResults: ["505aa5fb-8ae1-4bc7-a2cd-b06d4fd47956"],
          },
          {
            errorMessage: "Test timeout of 120000ms exceeded.",
            checkResults: [
              "6df6099b-74e6-4df0-9329-66e55c377970",
              "864e481d-4176-4991-918e-37e06d4f00f8",
            ],
          },
          {
            errorMessage:
              "Error: Timed out 30000ms waiting for expect(locator).toHaveTitle(expected)",
            checkResults: [
              "ee7cb36b-e3c3-418b-aa0c-c439f6ccdd83",
              "fdaa8c32-5862-4a60-844f-0c41b3c11bd9",
              "54678ac1-2285-41db-b743-f30c6a6b3263",
              "46a6573b-1654-4037-b239-5382afc2869f",
              "1cd67c28-87b3-4fc4-8abb-200b1a9eb3cd",
              "84fcb2c0-1233-4dd1-abb7-16936a6b16a0",
              "38a47bf1-400f-4e42-bae6-94926b00ec06",
              "3a44b559-27e4-4076-b327-eefc2a6a6226",
              "764ce63e-23a5-452b-8050-4f5011725754",
              "120a30a6-f2e8-4965-a724-a71e62141bd8",
              "67449d18-90aa-4171-8f9e-8bfef228630f",
              "7021109c-1882-4818-b283-f0f0847a4649",
              "2e31c00b-1900-4db3-911d-7906767f8567",
              "d1315faa-1173-4931-acc5-90d04688c9e7",
              "7dbee5b5-00fa-4405-bdc0-277190f6ec83",
              "2f1b8b21-272d-430d-923a-2467e0b37aa0",
              "10a32f0b-2015-42a3-b855-abd255f38f66",
              "a922620e-b67b-41b0-aac8-66198804b2b1",
              "acd627aa-5fab-4d65-bcdc-266d9bb9c78e",
              "39a36d08-8467-461a-900c-52f2cbb1c3ec",
              "cba3a795-8c68-485b-bc00-03e8a15d961e",
              "484a38c5-d75e-43a0-a480-c7ba3f45e716",
              "c32d4b13-2eb9-41f0-8394-0c3a43af9581",
              "c70fd597-277e-4639-b09b-70b9dd562bae",
              "3758b511-8fd9-405d-8561-e5cb63360706",
              "acc1ecee-d368-4172-8c85-8d38a0b2da20",
              "c249e1c5-efda-4a5e-b1fd-49faea8453ca",
              "4712dc00-4c2f-4c21-b8be-d1201dc64013",
            ],
          },
        ],
      },
    },
    {
      checkId: "5ee8e373-f204-45e4-b193-d652dba7e928",
      expected: {
        groups: [
          {
            errorMessage: "Test timeout of 120000ms exceeded.",
            checkResults: [
              "28c5806b-efce-4429-908b-434f88e6be4e",
              "f013732a-c1ef-4990-ac3d-673878a8dc8f",
              "a2f7f995-536f-4b1e-8d75-dcce38dbab33",
            ],
          },
          {
            errorMessage:
              "Error: Timed out 30000ms waiting for expect(locator).toBeVisible()\n\nLocator: getByRole('button', { name: /switch accounts/i })\nExpected: visible\nReceived: hidden\nCall log:\n  - expect.toBeVisible with timeout 30000ms\n  - waiting for getByRole('button', { name: /switch accounts/i })",
            checkResults: ["578495ed-4169-4dad-ade3-71c7b6804370"],
          },
          {
            errorMessage:
              "Error: Timed out 30000ms waiting for expect(locator).toBeVisible()\n\nLocator: getByRole('heading').filter({ hasText: 'No checks or groups matched your filters' })\nExpected: visible\nReceived: hidden\nCall log:\n  - expect.toBeVisible with timeout 30000ms\n  - waiting for getByRole('heading').filter({ hasText: 'No checks or groups matched your filters' })",
            checkResults: [
              "47a8bc46-2986-4ddd-83e3-63d94d3bab03",
              "9d5d04b9-f884-4f0f-b4ac-6587555de525",
            ],
          },
        ],
      },
    },
    {
      checkId: "005fd7bd-81f9-43e0-bcc5-4ac57002b8cd",
      expected: {
        groups: [
          {
            errorMessage: "Test timeout of 120000ms exceeded.",
            checkResults: [
              "90b2729a-5dff-44db-aac0-37c142e38574",
              "4a9f77ad-e509-4927-a344-63e188a5407e",
              "af51cebb-6982-4f19-84c5-4fdeb101a5c9",
            ],
          },
        ],
      },
    },
    {
      checkId: "28f31eaf-3169-4a13-8f7d-f547c100805f",
      expected: {
        groups: [
          {
            errorMessage: "Test timeout of 120000ms exceeded.",
            checkResults: [
              "b8b7777c-532e-4e6e-9216-f34feffb5d8b",
              "b78619a0-7160-4fc7-ab82-ea7ce74c0141",
              "cdd14764-6374-4ee5-ba9b-ee1696feb537",
              "59ace077-15ad-4fa0-80f9-47364fb29d13",
              "17dd4e3e-84e7-4003-87c7-38364275d37c",
              "c9598470-39b5-4597-98aa-ea085ed54d4d",
              "f95e0245-31d4-46cc-9a03-073501997430",
              "d4ed5f12-b071-4739-8b6e-acce20df1ca6",
              "d655e386-ac47-478c-8ea9-4ad40869be05",
              "807fa1c6-4638-4eda-bc7e-57e31f0e1afa",
              "d0963528-8074-46fa-a415-8311decbd11b",
              "ec9a33dd-3e55-4c7a-899d-1f15c2dd0ec4",
              "0d8fb76f-8cb5-4af9-b94a-746285813060",
              "1d47907f-a1f0-4c27-b583-51987b1606f1",
              "d279a029-a919-444d-adb2-14ff26f38dda",
              "339f0b5f-66de-4c9e-8cdf-b90d9b2e42f7",
              "b1f5dfff-f7e7-407e-a8c7-5cbb24226632",
              "698a6851-a007-4f18-bfc9-86421fb4f548",
              "74d64b07-c252-4787-8bd9-63990b15beb9",
              "ed5d7521-fdc7-4b29-83e6-31ea7ea5c054",
              "f9496075-af5f-49b8-923d-23485d17156a",
              "cef28b7a-c6c0-4885-867d-61c03a920f36",
              "23cb31cf-9ee8-432b-b3c5-3047f3f798ab",
              "501706cd-8e8a-4e48-b59a-cd9b3f062e0a",
              "12262bc7-0834-44ba-a6bb-47f4d538dfe1",
              "d4e3d564-7601-407f-b15d-bc0623cd669e",
              "735114a3-4df1-4954-9443-4e27d6337988",
            ],
          },
        ],
      },
    },
    {
      checkId: "84d25fb6-a6a7-4127-9c99-64cd3d754817",
      expected: {
        groups: [
          {
            errorMessage:
              "Error: Timed out 30000ms waiting for expect(locator).toBeVisible()\n\nLocator: getByRole('button', { name: /switch accounts/i })\nExpected: visible\nReceived: hidden\nCall log:\n  - expect.toBeVisible with timeout 30000ms\n  - waiting for getByRole('button', { name: /switch accounts/i })",
            checkResults: [
              "67c975c0-4f8b-4567-a271-22e1878943da",
              "9158c7dd-ccc0-47a9-9414-ca518e4ac364",
            ],
          },
          {
            errorMessage:
              "Error: Timed out 30000ms waiting for expect(locator).toBeVisible()\n\nLocator: getByText('Export to code')\nExpected: visible\nReceived: hidden\nCall log:\n  - expect.toBeVisible with timeout 30000ms\n  - waiting for getByText('Export to code')",
            checkResults: [
              "c568835f-7775-48c5-93b5-6f7070bf4680",
              "8dfdea30-8436-4366-b630-61171f3769d7",
            ],
          },
          {
            errorMessage: "Error: Test timeout of 120000ms exceeded.",
            checkResults: ["a2a13969-4c2f-45a5-8f98-c55d43eadb6b"],
          },
          {
            errorMessage: "Error: undefined",
            checkResults: ["1dba540f-1b7b-4e00-8652-7c874a3c18e7"],
          },
        ],
      },
    },
    {
      checkId: "683f229f-48d2-4b97-9161-db029f9d9a32",
      expected: {
        groups: [
          {
            errorMessage: "undefined",
            checkResults: [
              "13f6aa82-61b9-4aed-8e15-827041fde24b",
              "e37efec7-f409-4627-840d-fd28b195bb30",
              "8ade2538-5500-422a-9f9a-28b18613f683",
              "3f28e510-7d6e-4bc6-8c63-af27f9a4e8ac",
              "d3d12657-57e8-42b6-9c90-11c5529f40e7",
            ],
          },
          {
            errorMessage:
              "TimeoutError: locator.fill: Timeout 10000ms exceeded.\nCall log:\n  - waiting for getByRole('textbox', { name: 'email' })",
            checkResults: [
              "b7b2fa77-298b-486b-8214-035f601d1aec",
              "a22e3117-d5f7-41a5-9919-16889c5e3309",
              "e07eff3a-5672-4e4d-aa33-9a456f9ffa0f",
            ],
          },
          {
            errorMessage:
              "TimeoutError: locator.hover: Timeout 10000ms exceeded.\nCall log:\n  - waiting for locator('[data-testid=home-dashboard-table]').getByRole('row').filter({ has: locator('span').getByText('API check E2E test heo413sk', { exact: true }) }).getByRole('button').locator(':scope[aria-haspopup=menu]')",
            checkResults: ["a709fff6-3fd2-4e04-ba4a-90ac1a72f447"],
          },
        ],
      },
    },
    {
      checkId: "dd89cce7-3eec-4786-8e0e-0e5f3b3647b4",
      expected: {
        groups: [],
      },
    },
    {
      checkId: "e9ac8920-ee84-40aa-bd67-f3d04babc3db",
      expected: {
        groups: [
          {
            errorMessage: "Test timeout of 120000ms exceeded.",
            checkResults: [
              "e13cd594-6c08-4098-8f66-96f374c82b34",
              "5a62ba25-efab-469b-81d4-a47fe0db31ff",
              "17b1e8f6-fe18-4332-9aca-ee430b20e76e",
              "d0a9cafe-8b48-416f-b6db-463b995763c5",
              "1758ad06-6943-4998-9b4e-feb0ae2d21bd",
              "b16dafdd-84fa-4b06-8cc7-aeaa3e2ae516",
              "ab123006-d114-4ce0-a0f6-64a286e34f17",
              "dd176d51-54c6-49b1-9901-0bbae70fdfd3",
              "eb8c8385-2916-4836-8a1e-f8fdab5796c3",
              "f0b8efe2-835e-40ef-8059-8ec5744c1a77",
              "cb4186ca-cbfd-447e-ae04-86ed8829dfda",
              "5f109aca-e735-4679-8766-fa66be1c1b2d",
              "2cb00c30-b0d7-459f-8bce-03ce1a206f0e",
              "9ea1e360-bc58-4f14-b282-1d68e2d4fb67",
              "a9ace8d5-e939-467b-b832-60d9275a734d",
              "a6e7cd40-82bd-4ce9-a1fe-ce4b64723dd9",
              "524d4600-21b2-4fd1-b454-d82f496124d6",
              "d19c0afc-acd5-46d1-aa97-6f5b7715180e",
              "3d572b69-1fc0-4f91-9dfa-6a49b760f38f",
              "e1c97d3f-1019-4639-ac33-000c661d4b8a",
              "23cd993a-2cfd-4fa0-9754-7356137771dd",
              "95485458-f12b-461a-b14f-dc8fac13f8bb",
              "3f4c9e57-0ab4-4e20-a9de-77d7a94ded7f",
              "7d319217-e892-46af-a21d-53a3ff256111",
              "0a73047e-a233-4639-9d2d-eecc3acc0f78",
              "abae38a0-287b-4f40-8ff6-19df62dddbe3",
            ],
          },
          {
            errorMessage:
              "Error: Timed out 30000ms waiting for expect(locator).toBeVisible()\n\nLocator: getByRole('button', { name: /switch accounts/i })\nExpected: visible\nReceived: hidden\nCall log:\n  - expect.toBeVisible with timeout 30000ms\n  - waiting for getByRole('button', { name: /switch accounts/i })",
            checkResults: [
              "57e8031b-3043-4ddc-916d-b4e4d51a6a0e",
              "05fbe7c2-474a-417b-9498-bf222338d46d",
              "2c54f163-9898-465c-8254-66e0ef4baa9d",
            ],
          },
        ],
      },
    },
  ];

  it.concurrent.each(ERROR_GOUP_TEST_DATA)(
    "should find similar errors for check %s",
    async ({ checkId, expected }) => {
      const path = `results/groups/394650/checks/${checkId}/result-summary.json`;
      console.log("Reading file:", path);
      const input = JSON.parse(fs.readFileSync(path, "utf8"));

      const promptDef = summarizeErrorsPrompt(input);
      const { object: errorGroups } =
        await generateObject<SummarizeErrorsPromptType>(promptDef);

      console.log("GROUPS", checkId, JSON.stringify(errorGroups, null, 2));

      expect(errorGroups).toEqual(expected);

      // const checkResults = input.results.filter((result) =>
      //   errorGroups.groups[2].checkResults.includes(result.id),
      // );

      // console.log(
      //   "CLUSTERS",
      //   JSON.stringify(clusterCheckResults(input, checkResults), null, 2),
      // );
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
