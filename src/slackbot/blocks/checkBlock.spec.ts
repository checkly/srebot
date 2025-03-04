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

    const mockErrorGroups = {
      groups: [
        {
          errorMessage: "Test error message",
          checkResults: ["test-result-id-1", "test-result-id-2"],
        },
      ],
    };

    const result = createCheckBlock({
      check: mockCheck,
      checkAppUrl: "https://app.checklyhq.com/checks/test-check-id",
      errorGroups: mockErrorGroups,
      checkResults: mockCheckResults,
    });

    expect(result.blocks).toMatchSnapshot();
  });
});
