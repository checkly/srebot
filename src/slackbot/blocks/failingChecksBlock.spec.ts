import { Check, renderFailingChecksBlock } from "./failingChecksBlock";

describe("failingChecksBlock", () => {
  const now = new Date();

  it("renders checks with mixed states", () => {
    const checks = [
      {
        checkId: "123",
        checkState: "FAILED",
        name: "Check 1",
        failures: { total: 1, timeframe: "24h" },
        lastFailure: {
          checkResultId: "123",
          timestamp: now,
        },
      },
      {
        checkId: "124",
        checkState: "PASSED",
        name: "Check 2",
        failures: { total: 0, timeframe: "24h" },
        group: "Group 2",
      },
      {
        checkId: "125",
        checkState: "DEGRADED",
        name: "Check 3",
        failures: { total: 2, timeframe: "24h" },
        group: "Group 3",
        lastFailure: {
          checkResultId: "125",
          timestamp: now,
        },
      },
      {
        checkId: "126",
        checkState: "PASSED",
        name: "Check 4",
        failures: { total: 0, timeframe: "24h" },
        group: "Group 4",
      },
    ] as Check[];

    const blocks = renderFailingChecksBlock(checks);
    expect(blocks).toMatchSnapshot();
  });

  it("renders all passing checks", () => {
    const checks = [
      {
        checkId: "124",
        checkState: "PASSED",
        name: "Check 2",
        failures: { total: 0, timeframe: "24h" },
        group: "Group 2",
      },
      {
        checkId: "126",
        checkState: "PASSED",
        name: "Check 4",
        failures: { total: 0, timeframe: "24h" },
        group: "Group 4",
      },
    ] as Check[];

    const blocks = renderFailingChecksBlock(checks);
    expect(blocks).toMatchSnapshot();
  });

  it("renders all failing checks", () => {
    const checks = [
      {
        checkId: "123",
        checkState: "FAILED",
        name: "Check 1",
        failures: { total: 1, timeframe: "24h" },
        lastFailure: {
          checkResultId: "123",
          timestamp: now,
        },
      },
      {
        checkId: "125",
        checkState: "DEGRADED",
        name: "Check 3",
        failures: { total: 2, timeframe: "24h" },
        group: "Group 3",
        lastFailure: {
          checkResultId: "125",
          timestamp: now,
        },
      },
    ] as Check[];

    const blocks = renderFailingChecksBlock(checks);
    expect(blocks).toMatchSnapshot();
  });
});
