import { checkly } from "./client";
import { Check, CheckResult } from "./models";

export const mapCheckToContextValue = (check: Check) => {
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

export const mapCheckResultToContextValue = (result: CheckResult) => {
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

export const getLastCheckResult = async (
  checkId: string,
  hasFailures: boolean,
) => {
  const results = await checkly.getCheckResults(checkId, hasFailures, 1);
  return results[0];
};
