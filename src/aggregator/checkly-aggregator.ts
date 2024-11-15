import { CheckContext, ContextKey } from "./ContextAggregator";
import { checkly } from "../checkly/client";
import { AlertDto } from "src/checkly/alertDTO";

export const checklyAggregator = {
	fetchContext: async (alert: AlertDto): Promise<CheckContext[]> => {
		const [check, results] = await Promise.all([
			checkly.getCheck(alert.CHECK_ID),
			checkly.getCheckResults(alert.CHECK_ID, undefined, 1),
		]);
		const makeCheckContext = (key: ContextKey, value: unknown) => {
			return {
				checkId: alert.CHECK_ID,
				source: "checkly",
				key,
				value,
			} as CheckContext;
		};

		const checklyCheckContext = [
			makeCheckContext(ContextKey.ChecklyAlert, { ...alert }),
			makeCheckContext(ContextKey.ChecklyCheck, check),
			makeCheckContext(ContextKey.ChecklyResults, results),
		] as CheckContext[];

		return checklyCheckContext;
	},
};
