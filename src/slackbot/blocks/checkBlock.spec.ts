import { describe, expect, it } from "@jest/globals";
import { createCheckBlock } from "./checkBlock";
import { Check, CheckResult } from "../../checkly/models";

describe("checkBlock", () => {
  it("should create a message block for a check summary", () => {
    const mockCheck: Check = {
      id: "test-check-id",
      name: "Test Check",
      checkType: "BROWSER",
      frequency: 10,
      locations: ["us-east-1", "eu-west-1"],
    } as Check;

    const mockCheckResults: CheckResult[] = [
      {
        id: "test-result-id-1",
        runLocation: "us-east-1",
      } as CheckResult,
      {
        id: "test-result-id-2",
        runLocation: "eu-west-1",
      } as CheckResult,
    ];

    const mockErrorGroups = [
      {
        error_message: "Test error message",
        error_count: 2,
        locations: ["us-east-1", "eu-west-1"],
        checkResults: ["test-result-id-1", "test-result-id-2"],
      },
    ];

    const result = createCheckBlock({
      check: mockCheck,
      failureCount: 42,
      errorGroups: mockErrorGroups,
      checkResults: mockCheckResults,
      frequency: 10,
      locations: ["us-east-1", "eu-west-1"],
    });

    expect(result.blocks).toMatchSnapshot();
  });
});
