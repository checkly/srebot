import { CheckContext, ContextKey } from "./ContextAggregator";
import { checkly } from "../checkly/client";
import { WebhookAlertDto } from "../checkly/alertDTO";
import {
	mapCheckResultToContextValue,
	mapCheckToContextValue,
} from "../checkly/utils";

export const checklyAggregator = {
	fetchContext: async (alert: WebhookAlertDto): Promise<CheckContext[]> => {
		const [check, results] = await Promise.all([
			checkly.getCheck(alert.CHECK_ID),
			checkly.getCheckResult(alert.CHECK_ID, alert.CHECK_RESULT_ID),
		]);
		const makeCheckContext = (key: ContextKey, value: unknown) => {
			return {
				checkId: alert.CHECK_ID,
				source: "checkly",
				key,
				value,
			} as CheckContext;
		};

		const logs = results.getLog();
		const script = check.script;

		const checklyCheckContext = [
			makeCheckContext(ContextKey.ChecklyScript, script),
			makeCheckContext(ContextKey.ChecklyCheck, mapCheckToContextValue(check)),
			makeCheckContext(
				ContextKey.ChecklyResults,
				mapCheckResultToContextValue(results)
			),
			makeCheckContext(ContextKey.ChecklyLogs, logs),
		] as CheckContext[];

		return checklyCheckContext;
	},
};
