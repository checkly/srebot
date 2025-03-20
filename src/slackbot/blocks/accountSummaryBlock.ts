interface AccountSummaryProps {
  accountName: string;
  passingChecks: number;
  degradedChecks: number;
  failingChecks: number;
  hasIssues: boolean;
  issuesSummary: string;
  failingChecksGoals: string;
  failingCheckIds: string[];
}

export function createAccountSummaryBlock({
  accountName,
  passingChecks,
  degradedChecks,
  failingChecks,
  hasIssues,
  issuesSummary,
  failingChecksGoals,
  failingCheckIds,
}: AccountSummaryProps) {
  const state = hasIssues ? "❌" : "✅";
  const stateText = hasIssues
    ? `Account ${accountName} has issues.`
    : `Account ${accountName} appears stable.`;

  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${state} ${stateText}`,
          emoji: true,
        },
      },
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [
              {
                type: "text",
                text: "Blast Radius:\n",
                style: {
                  bold: true,
                },
              },
            ],
          },
          {
            type: "rich_text_list",
            style: "bullet",
            indent: 0,
            elements: [
              {
                type: "rich_text_section",
                elements: [
                  {
                    type: "text",
                    text: `${issuesSummary}`,
                  },
                ],
              },
              {
                type: "rich_text_section",
                elements: [
                  {
                    type: "text",
                    text: `${failingChecksGoals}`,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:white_check_mark: *PASSING*: ${passingChecks} :warning: *DEGRADED*: ${degradedChecks} :x: *FAILING*: ${failingChecks}`,
        },
      },
      ...(failingCheckIds.length > 0
        ? [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    emoji: true,
                    text: "List Failing Checks",
                  },
                  action_id: "show_failing_checks",
                  value: failingCheckIds.join(","),
                },
              ],
            },
          ]
        : []),
    ],
  };
}
