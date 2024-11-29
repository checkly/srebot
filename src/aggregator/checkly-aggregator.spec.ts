import "reflect-metadata";
import { checkly } from "../checkly/client";
import { WebhookAlertDto } from "../checkly/alertDTO";
import { checklyAggregator } from "./checkly-aggregator";
import "dotenv/config";
import { plainToInstance } from "class-transformer";

jest.setTimeout(30000);
describe("ChecklyService", () => {
	it("can collect chekly context", async () => {
		const checks = await checkly.getChecks();
		const context = await checklyAggregator.fetchContext(
			plainToInstance(
				WebhookAlertDto,
				{
					CHECK_NAME: "GET /books",
					CHECK_ID: "c289cb3b-8d20-4c93-9c95-38956abca933",
					CHECK_TYPE: "API",
					GROUP_NAME: "",
					ALERT_TITLE: "GET /books has failed",
					ALERT_TYPE: "ALERT_FAILURE",
					CHECK_RESULT_ID: "b5036112-5843-42bc-9991-9f368a43e46b",
					RESPONSE_TIME: 36,
					API_CHECK_RESPONSE_STATUS_CODE: 500,
					API_CHECK_RESPONSE_STATUS_TEXT: "Internal Server Error",
					RUN_LOCATION: "Ireland",
					RESULT_LINK:
						"https://app.checklyhq.com/checks/c289cb3b-8d20-4c93-9c95-38956abca933/results/api/b5036112-5843-42bc-9991-9f368a43e46b",
					SSL_DAYS_REMAINING: "",
					SSL_CHECK_DOMAIN: "",
					STARTED_AT: "2024-11-29T15:34:21.900Z",
					TAGS: "website,api,srebot",
					$RANDOM_NUMBER: 1547,
					$UUID: "380b94c2-2c56-4f1d-904a-a6122d96722a",
					moment: "November 29, 2024",
				},
				{ enableImplicitConversion: true }
			)
		);

		expect(context).toBeDefined();
		expect(context.length).toBeGreaterThan(0);
	});
});
