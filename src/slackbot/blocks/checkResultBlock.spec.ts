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

    expect(result.blocks).toHaveLength(3);
    expect(result.blocks[0].type).toBe("header");
    expect(result.blocks[1].type).toBe("section");
    expect(result.blocks[2].type).toBe("section");

    // Verify field contents
    const fields = result.blocks[1].fields;
    expect(fields?.[0]?.text).toContain("Test Check");
    expect(fields?.[1]?.text).toContain("2024-01-01");
    expect(fields?.[2]?.text).toContain("us-east-1");

    // Verify error message section
    expect(result.blocks[2].text?.text).toContain("Test error message");
    expect(result.blocks[2].text?.text).toContain("1 times");
  });
});
