import { ChecklyClient } from "../checkly/checklyclient";
import { CheckResult } from "../checkly/models";

export const LAST_30_DAYS = {
  from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  to: new Date(),
};

export const LAST_24_HOURS = {
  from: new Date(Date.now() - 24 * 60 * 60 * 1000),
  to: new Date(),
};

export const LAST_1_HOURS = {
  from: new Date(Date.now() - 60 * 60 * 1000),
  to: new Date(),
};

export const last24h = (date: Date) => {
  return {
    from: new Date(date.getTime() - 24 * 60 * 60 * 1000),
    to: new Date(),
  };
};

export async function fetchCheckResults(
  checkly: ChecklyClient,
  {
    checkId,
    from,
    to,
  }: {
    checkId: string;
    from?: Date;
    to?: Date;
  },
) {
  return await checkly.getCheckResultsByCheckId(checkId, {
    resultType: "ALL",
    from: from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: to ?? new Date(),
    limit: 100,
  });
}

export function summarizeCheckResult(checkResult: CheckResult) {
  const error =
    checkResult.browserCheckResult?.errors.find((e) => !!e.message)?.message ||
    "No Error provided";
  return {
    id: checkResult.id,
    sequenceId: checkResult.sequenceId,
    resultType: checkResult.resultType,
    startedAt: checkResult.startedAt,
    location: checkResult.runLocation,
    attempts: checkResult.attempts,
    error: error.split("\n")[0],
  };
}
