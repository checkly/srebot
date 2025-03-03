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

    expect(result.blocks).toBeDefined();
    expect(result.blocks[0].type).toBe("header");
    expect(result.blocks[0].text?.text).toContain("Test Check");

    // Verify check details section
    const fields = result.blocks[2]?.fields;
    expect(fields?.[0]?.text).toContain("Browser");
    expect(fields?.[1]?.text).toContain("\`10\` minutes");
    expect(fields?.[2]?.text).toContain("us-east-1");
    expect(fields?.[2]?.text).toContain("eu-west-1");

    // Verify error patterns section
    expect(result.blocks[3].text?.text).toBe("Detected Error Patterns");

    // Verify error group details
    const errorGroupFields = result.blocks[6].fields;
    expect(errorGroupFields?.[0]?.text).toContain("\`2\` failures");
    expect(errorGroupFields?.[1]?.text).toContain("us-east-1");
    expect(errorGroupFields?.[1]?.text).toContain("eu-west-1");
  });
});
