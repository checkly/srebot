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
					CHECK_NAME: "fail50",
					CHECK_ID: "b68422ae-6528-45a5-85a6-e85e1be9de2e",
					CHECK_TYPE: "MULTI_STEP",
					GROUP_NAME: "",
					ALERT_TITLE: "fail50 has failed",
					ALERT_TYPE: "ALERT_FAILURE",
					CHECK_RESULT_ID: "64f3fe90-db20-4817-abce-c3fb9dd4228a",
					RESPONSE_TIME: 1715,
					API_CHECK_RESPONSE_STATUS_CODE: 0,
					"API_CHECK_RESPONSE_STATUS_T∑EXT": "",
					RUN_LOCATION: "Frankfurt",
					RESULT_LINK:
						"https://app.checklyhq.com/checks/b68422ae-6528-45a5-85a6-e85e1be9de2e/results/multi_step/64f3fe90-db20-4817-abce-c3fb9dd4228a",
					SSL_DAYS_REMAINING: 0,
					SSL_CHECK_DOMAIN: "",
					STARTED_AT: "2024-11-15T13:39:26.259Z",
					TAGS: [],
					$RANDOM_NUMBER: 3022,
					$UUID: "cbe2286f-a353-400c-a797-87f4cda1d6d8",
					moment: "November 15, 2024",
				},
				{ enableImplicitConversion: true }
			)
		);

		expect(context).toBeDefined();
		expect(context.length).toBeGreaterThan(0);
	});
});
