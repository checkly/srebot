import { ChecklyClient } from "../checkly/checklyclient";
import { CheckResult, ErrorMessage } from "../checkly/models";

export function last1h(date: Date = new Date()) {
  return {
    from: new Date(date.getTime() - 60 * 60 * 1000),
    to: date,
  };
}

export const last24h = (date: Date = new Date()) => {
  return {
    from: new Date(date.getTime() - 24 * 60 * 60 * 1000),
    to: date,
  };
};

export function last30d(date: Date = new Date()) {
  return {
    from: new Date(date.getTime() - 30 * 24 * 60 * 60 * 1000),
    to: date,
  };
}

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
    resultType: "FINAL",
    from: from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: to ?? new Date(),
    limit: 100,
  });
}

export function summarizeCheckResult(checkResult: CheckResult) {
  const error = getErrorMessageFromCheckResult(checkResult);
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

export function getErrorMessageFromCheckResult(
  checkResult: CheckResult,
): string {
  if (checkResult.apiCheckResult) {
    return getErrorMessageFromApiError(checkResult);
  }
  if (checkResult.multiStepCheckResult) {
    return getErrorMessageFromResult(checkResult.multiStepCheckResult);
  }
  if (checkResult.browserCheckResult) {
    return getErrorMessageFromResult(checkResult.browserCheckResult);
  }

  throw new Error("Unsupported Check Result Type");
}

export function getErrorMessageFromResult(result: {
  errors?: ErrorMessage[];
}): string {
  const errorFromMessages = result.errors
    ?.map((e) => {
      if (typeof e === "string") {
        return e;
      }
      return e.message;
    })
    .find((e) => !!e);

  // TODO public API is not yet returning scheduling errors. We can deal with this later
  return errorFromMessages || "Scheduling error"; // Fallback to scheduling issues
}

export function getErrorMessageFromApiError(checkResult: CheckResult): string {
  const assertionErrors =
    checkResult.apiCheckResult?.assertions
      ?.filter((a) => (a.error ? a.error : null))
      ?.map((a) => a.error)
      ?.join("\n") || "";
  if (assertionErrors.trim()) {
    return assertionErrors.trim();
  }

  const overMaxResponseTime = checkResult.overMaxResponseTime;
  if (overMaxResponseTime) {
    return "Response time over max response time";
  }

  const requestError = checkResult.apiCheckResult?.requestError;
  if (requestError) {
    return requestError;
  }

  const setupErrors = checkResult.apiCheckResult?.jobLog?.setup?.filter(
    (log) => log.level === "ERROR",
  );
  if (setupErrors?.length) {
    return setupErrors[setupErrors.length - 1].msg;
  }
  const teardownErrors = checkResult.apiCheckResult?.jobLog?.teardown?.filter(
    (log) => log.level === "ERROR",
  );
  if (teardownErrors?.length) {
    return teardownErrors[teardownErrors.length - 1].msg;
  }

  return "Unable to extract error message";
}
