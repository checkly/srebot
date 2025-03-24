import { LIST_ERROR_PATTERNS_ACTION_ID } from "./errorPatternBlock";
import { LIST_FAILING_CHECKS_ACTION_ID } from "./failingChecksBlock";

interface AccountSummaryProps {
  accountName: string;
  passingChecks: number;
  degradedChecks: number;
  failingChecks: number;
  hasIssues: boolean;
  issuesSummary: string;
  failingChecksGoals: string;
  failingCheckIds: string[];
  errorPatterns: { id: string; description: string; count: number }[];
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
  errorPatterns,
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
      ...(errorPatterns.length > 0
        ? [
            {
              type: "rich_text",
              elements: [
                {
                  type: "rich_text_section",
                  elements: [
                    {
                      type: "text",
                      text: "Top 3 Error Patterns:\n",
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
                  elements: errorPatterns.slice(0, 3).map((errorPattern) => ({
                    type: "rich_text_section",
                    elements: [
                      {
                        type: "text",
                        text: `${errorPattern.description} (${errorPattern.count} times)`,
                      },
                    ],
                  })),
                },
              ],
            },
          ]
        : []),
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:white_check_mark: *PASSING*: ${passingChecks} :warning: *DEGRADED*: ${degradedChecks} :x: *FAILING*: ${failingChecks}`,
        },
      },
      ...(failingCheckIds.length > 0 || errorPatterns.length > 0
        ? [
            {
              type: "actions",
              elements: [
                ...(failingCheckIds.length > 0
                  ? [
                      {
                        type: "button",
                        text: {
                          type: "plain_text",
                          emoji: true,
                          text: "List Failing Checks",
                        },
                        action_id: LIST_FAILING_CHECKS_ACTION_ID,
                        value: failingCheckIds.join(","),
                      },
                    ]
                  : []),
                ...(errorPatterns.length > 0
                  ? [
                      {
                        type: "button",
                        text: {
                          type: "plain_text",
                          emoji: true,
                          text: "List Error Patterns",
                        },
                        action_id: LIST_ERROR_PATTERNS_ACTION_ID,
                        value: errorPatterns.map((ep) => ep.id).join(","),
                      },
                    ]
                  : []),
              ],
            },
          ]
        : []),
    ],
  };
}
