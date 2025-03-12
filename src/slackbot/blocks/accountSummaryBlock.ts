interface AccountSummaryProps {
  accountName: string;
  passingChecks: number;
  degradedChecks: number;
  failingChecks: number;
  hasIssues: boolean;
  issuesSummary: string;
}

export function createAccountSummaryBlock({
  accountName,
  passingChecks,
  degradedChecks,
  failingChecks,
  hasIssues,
  issuesSummary: hasIssuesSummary,
}: AccountSummaryProps) {
  const state = hasIssues ? "❌" : "✅";
  const stateText = hasIssues
    ? `Account ${accountName} has issues.`
    : `Account ${accountName} appears stable.`;

  return {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*State:* ${state} ${stateText}\n*Availability:* ${hasIssuesSummary}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:white_check_mark: *PASSING*: ${passingChecks} :warning: *DEGRADED*: ${degradedChecks} :x: *FAILING*: ${failingChecks}`,
        },
      },
    ],
  };
}
