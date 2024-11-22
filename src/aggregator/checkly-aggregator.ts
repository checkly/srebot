import { CheckContext, ContextKey } from "./ContextAggregator";
import { checkly } from "../checkly/client";
import { WebhookAlertDto } from "../checkly/alertDTO";
import { Check, CheckResult } from "../checkly/models";

const getCheckLogs = async (checkId: string, checkResultId: string) => {
	const logs = await checkly.getCheckResult(checkId, checkResultId);
	console.log("logs");
	console.log(logs);

	return logs;
};

const mapCheckToContextValue = (check: Check) => {
	return {
		checkId: check.id,
		type: check.checkType,
		frequency: check.frequency,
		frequencyOffset: check.frequencyOffset,
		shouldFail: check.shouldFail,
		locations: check.locations,
		tags: check.tags,
		maxResponseTime: check.maxResponseTime,
		sslCheckDomain: check.sslCheckDomain,
		retryStrategy: check.retryStrategy,
	};
};

const mapCheckResultToContextValue = (result: CheckResult) => {
	return {
		resultId: result.id,
		hasErrors: result.hasErrors,
		hasFailures: result.hasFailures,
		runLocation: result.runLocation,
		startedAt: result.startedAt,
		stoppedAt: result.stoppedAt,
		responseTime: result.responseTime,
		checkId: result.checkId,
		attempts: result.attempts,
		isDegraded: result.isDegraded,
		overMaxResponseTime: result.overMaxResponseTime,
		resultType: result.resultType,
	};
};

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
