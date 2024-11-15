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
					CHECK_ID: checks[0].id,
				},
				{ enableImplicitConversion: true }
			)
		);

		expect(context).toBeDefined();
	});
});
