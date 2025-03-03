import { ChecklyClient } from "../checkly/checklyclient";
import { CheckResult } from "../checkly/models";

// export async function fetchChecksForGroup(checks: Check[]) {
//   const intervalStart = Date.now() - 30 * 24 * 60 * 60 * 1000;
//   const intervalEnd = Date.now();

//   const results: any[] = [];
//   for (const check of checks) {
//     // Get failed results from last 30 days

//     return results;
//   }
// }

export const LAST_30_DAYS = {
  from: Date.now() - 30 * 24 * 60 * 60 * 1000,
  to: Date.now(),
};

export const LAST_24_HOURS = {
  from: Date.now() - 24 * 60 * 60 * 1000,
  to: Date.now(),
};

export const LAST_1_HOURS = {
  from: Date.now() - 60 * 60 * 1000,
  to: Date.now(),
};

export const last24h = (date: Date) => {
  return {
    from: date.getTime() - 24 * 60 * 60 * 1000,
    to: date.getTime(),
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
    from?: number;
    to?: number;
  },
) {
  return await checkly.getCheckResultsByCheckId(checkId, {
    resultType: "ALL",
    fromMs: from ?? Date.now() - 30 * 24 * 60 * 60 * 1000,
    toMs: to ?? Date.now(),
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
