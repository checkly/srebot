import { plainToInstance } from "class-transformer";
import "dotenv/config";
import "reflect-metadata";
import { WebhookAlertDto } from "../checkly/alertDTO";
import { checkly } from "../checkly/client";
import { checklyAggregator } from "./checkly-aggregator";

jest.setTimeout(30000);
describe("ChecklyService", () => {
  it("can collect chekly context", async () => {
    const checks = await checkly.getChecks();
    const context = await checklyAggregator.fetchContext(
      plainToInstance(
        WebhookAlertDto,
        {
          CHECK_NAME: "GET /books",
          CHECK_ID: "d6330bf8-1928-4953-9bc1-f4ac8d98f81f",
          CHECK_TYPE: "API",
          GROUP_NAME: "",
          ALERT_TITLE: "GET /books has failed",
          ALERT_TYPE: "ALERT_FAILURE",
          CHECK_RESULT_ID: "e394cc96-bbb9-4cc7-a715-9501cce87ac0",
          RESPONSE_TIME: 36,
          API_CHECK_RESPONSE_STATUS_CODE: 500,
          API_CHECK_RESPONSE_STATUS_TEXT: "Internal Server Error",
          RUN_LOCATION: "Ireland",
          RESULT_LINK:
            "https://app.checklyhq.com/checks/d6330bf8-1928-4953-9bc1-f4ac8d98f81f/check-sessions/e4b448a4-8909-4c89-8278-6a6494fc007f/results/e394cc96-bbb9-4cc7-a715-9501cce87ac0",
          SSL_DAYS_REMAINING: "",
          SSL_CHECK_DOMAIN: "",
          STARTED_AT: "2025-01-15T15:34:21.900Z",
          TAGS: "website,api,srebot",
          $RANDOM_NUMBER: 1547,
          $UUID: "380b94c2-2c56-4f1d-904a-a6122d96722a",
          moment: "January 15, 2025",
        },
        { enableImplicitConversion: true }
      )
    );

    expect(context).toBeDefined();
    expect(context.length).toBeGreaterThan(0);
  });
});
