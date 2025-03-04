import { describe, expect, it } from "@jest/globals";
import { createCheckResultBlock } from "./checkResultBlock";
import { ChecklyClient } from "../../checkly/checklyclient";
import { Check, CheckResult } from "../../checkly/models";

describe("checkResultBlock", () => {
  it("should create a message block for a check result", () => {
    const mockCheck: Check = {
      id: "test-check-id",
      name: "Test Check",
      locations: ["us-east-1", "eu-west-1"],
    } as Check;

    const mockCheckResult: CheckResult = {
      id: "test-result-id",
      runLocation: "us-east-1",
    } as CheckResult;

    const mockErrorGroups = {
      groups: [
        {
          errorMessage: "Test error message",
          checkResults: ["test-result-id"],
        },
      ],
    };

    const result = createCheckResultBlock({
      check: mockCheck,
      checkAppUrl: "https://app.checklyhq.com/checks/test-check-id",
      checkResult: mockCheckResult,
      checkResultAppUrl:
        "https://app.checklyhq.com/checks/test-check-id/results/test-result-id",
      errorGroups: mockErrorGroups,
      failingCheckResults: [mockCheckResult],
      intervalStart: new Date("2024-01-01T00:00:00.000Z"),
    });

    expect(result.blocks).toMatchSnapshot();
  });
});
