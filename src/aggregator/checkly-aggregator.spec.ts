import { checkly } from "../checkly/client";
import { AlertDto } from "../checkly/alertDTO";
import { checklyAggregator } from "./checkly-aggregator";
import "dotenv/config";

jest.setTimeout(30000);
describe("ChecklyService", () => {
	it("can collect chekly context", async () => {
		const checks = await checkly.getChecks();
		const context = await checklyAggregator.fetchContext(
			new AlertDto({
				CHECK_ID: checks[0].id,
			})
		);

		expect(context).toBeDefined();
	});
});
