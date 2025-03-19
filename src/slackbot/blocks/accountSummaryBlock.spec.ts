import { createAccountSummaryBlock } from "./accountSummaryBlock";

describe("accountSummaryBlock", () => {
  it("renders healthy account state", () => {
    const blocks = createAccountSummaryBlock({
      accountName: "Healthy",
      passingChecks: 50,
      degradedChecks: 0,
      failingChecks: 0,
      hasIssues: false,
      issuesSummary: "No issues detected in the last 24h.",
      failingChecksGoals: "No failing checks detected in the last 24h.",
      failingCheckIds: [],
    });

    expect(blocks).toMatchSnapshot();
  });

  it("renders degraded account state", () => {
    const blocks = createAccountSummaryBlock({
      accountName: "Degraded",
      passingChecks: 45,
      degradedChecks: 5,
      failingChecks: 0,
      hasIssues: true,
      issuesSummary:
        "New degrading or failing checks detected in the last 24h.",
      failingChecksGoals: "No failing checks detected in the last 24h.",
      failingCheckIds: ["123", "124"],
    });

    expect(blocks).toMatchSnapshot();
  });

  it("renders failing account state", () => {
    const blocks = createAccountSummaryBlock({
      accountName: "Failing",
      passingChecks: 40,
      degradedChecks: 2,
      failingChecks: 8,
      hasIssues: true,
      issuesSummary:
        "New degrading or failing checks detected in the last 24h.",
      failingChecksGoals: "No failing checks detected in the last 24h.",
      failingCheckIds: ["123", "124", "125"],
    });

    expect(blocks).toMatchSnapshot();
  });
});
