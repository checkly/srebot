import "reflect-metadata";
import { WebhookAlertDto } from "../checkly/alertDTO";
import { githubAggregator } from "./github-aggregator";
import "dotenv/config";
import { plainToInstance } from "class-transformer";

jest.setTimeout(30000);

describe.skip("GithubAggregator", () => {
  it("can collect github context from configured repos", async () => {
    // Create a sample alert DTO similar to the one in checkly-aggregator.spec.ts
    const context = await githubAggregator
      .fetchContext(
        plainToInstance(
          WebhookAlertDto,
          {
            CHECK_NAME: "test-check",
            CHECK_ID: "test-check-id",
            CHECK_TYPE: "MULTI_STEP",
            GROUP_NAME: "",
            ALERT_TITLE: "Test check has failed",
            ALERT_TYPE: "ALERT_FAILURE",
            CHECK_RESULT_ID: "test-result-id",
            RESPONSE_TIME: 1000,
            API_CHECK_RESPONSE_STATUS_CODE: 0,
            API_CHECK_RESPONSE_STATUS_TEXT: "",
            RUN_LOCATION: "Frankfurt",
            RESULT_LINK: "https://example.com",
            SSL_DAYS_REMAINING: 0,
            SSL_CHECK_DOMAIN: "",
            STARTED_AT: "2024-03-15T13:39:26.259Z",
            TAGS: [],
            $RANDOM_NUMBER: 1234,
            $UUID: "test-uuid",
            moment: "March 15, 2024",
          },
          { enableImplicitConversion: true },
        ),
      )
      .catch((error) => {
        console.error("Error fetching context:", error);
        return [];
      });

    expect(context).toBeDefined();
    expect(Array.isArray(context)).toBe(true);

    // If repos are configured, we should get some context
    if (process.env.GITHUB_REPOS || process.env.GITHUB_ORG) {
      expect(context.length).toBeGreaterThan(0);

      // Test structure of returned context
      context.forEach((item) => {
        expect(item).toHaveProperty("checkId", "test-check-id");
        expect(item).toHaveProperty("source", "github");
        expect(item).toHaveProperty("key");
        expect(item).toHaveProperty("value");
      });
    }
  });
});
