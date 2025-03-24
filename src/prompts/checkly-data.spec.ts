import { describe, expect, test } from "@jest/globals";
import {
  getErrorMessageFromApiError,
  getErrorMessageFromResult,
} from "./checkly-data";
import { CheckResult, ErrorMessage } from "../checkly/models";

describe("checkly error messages", () => {
  test("should extract assertion error message", () => {
    const result = {
      id: "fa87a47c-3b62-4971-afa7-830326ba9e1e",
      apiCheckResult: {
        assertions: [
          {
            error: "expected 200 to equal 404",
            actual: 200,
          },
        ],
      },
    } as unknown as CheckResult;

    const error = getErrorMessageFromApiError(result);

    expect(error).toEqual("expected 200 to equal 404");
  });

  test("should detect timeout error", () => {
    const result = {
      id: "dce539c4-d151-44d2-ad61-0062bb207d76",
      hasFailures: true,
      overMaxResponseTime: true,
    } as unknown as CheckResult;

    const error = getErrorMessageFromApiError(result);

    expect(error).toEqual("Response time over max response time");
  });

  test("should detect setup script error", () => {
    const result = {
      id: "2ca730dd-48d1-4164-a5c1-13929f144b5b",
      apiCheckResult: {
        jobLog: {
          setup: [
            {
              msg: "error in setup script",
              level: "ERROR",
            },
          ],
        },
      },
    } as unknown as CheckResult;

    const error = getErrorMessageFromApiError(result);

    expect(error).toEqual("error in setup script");
  });

  test("should extract teardown error message", () => {
    const result = {
      id: "2ca730dd-48d1-4164-a5c1-13929f144b5b",
      apiCheckResult: {
        jobLog: {
          teardown: [
            {
              msg: "error in tear down script",
              level: "ERROR",
            },
          ],
        },
      },
    } as unknown as CheckResult;

    const error = getErrorMessageFromApiError(result);

    expect(error).toEqual("error in tear down script");
  });

  test("should extract SSL error message", () => {
    const sslError = {
      id: "a2283ec0-b938-4cc2-b91c-3e731fd64421",
      apiCheckResult: {
        requestError:
          "RequestError: Error [ERR_TLS_CERT_ALTNAME_INVALID]: Hostname/IP does not match certificate's altnames: Host: wrong.host.badssl.com. is not in the cert's altnames: DNS:*.badssl.com, DNS:badssl.com",
      },
    } as unknown as CheckResult;

    const error = getErrorMessageFromApiError(sslError);

    expect(error).toEqual(sslError.apiCheckResult!.requestError);
  });

  test("should extract plain string browser error message", () => {
    const result = {
      id: "a2283ec0-b938-4cc2-b91c-3e731fd64421",
      browserCheckResult: {
        errors: ["error in browser script"] as ErrorMessage[],
      },
    };

    const error = getErrorMessageFromResult(result.browserCheckResult);

    expect(error).toEqual("error in browser script");
  });

  test("should extract error after empty string", () => {
    const result = {
      id: "a2283ec0-b938-4cc2-b91c-3e731fd64421",
      browserCheckResult: {
        errors: ["", "error in browser script"] as ErrorMessage[],
      },
    };

    const error = getErrorMessageFromResult(result.browserCheckResult);

    expect(error).toEqual("error in browser script");
  });

  test("should extract browser error message", () => {
    const result = {
      id: "a2283ec0-b938-4cc2-b91c-3e731fd64421",
      browserCheckResult: {
        errors: [{ message: "error in browser script" }] as ErrorMessage[],
      },
    };

    const error = getErrorMessageFromResult(result.browserCheckResult);

    expect(error).toEqual("error in browser script");
  });

  test("should extract plain string multi-step error message", () => {
    const result = {
      id: "a2283ec0-b938-4cc2-b91c-3e731fd64421",
      multiStepCheckResult: {
        errors: ["error in multi-step script"] as ErrorMessage[],
      },
    };

    const error = getErrorMessageFromResult(result.multiStepCheckResult);

    expect(error).toEqual("error in multi-step script");
  });

  test("should extract multi-step error message", () => {
    const result = {
      id: "a2283ec0-b938-4cc2-b91c-3e731fd64421",
      multiStepCheckResult: {
        errors: [{ message: "error in multi-step script" }] as ErrorMessage[],
      },
    };

    const error = getErrorMessageFromResult(result.multiStepCheckResult);

    expect(error).toEqual("error in multi-step script");
  });

  test("should safely fallback when errors are missing", () => {
    const error = getErrorMessageFromResult({});

    expect(error).toEqual("Scheduling error");
  });
});
