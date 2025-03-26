import { LIST_ERROR_PATTERNS_ACTION_ID } from "./errorPatternBlock";
import { LIST_FAILING_CHECKS_ACTION_ID } from "./failingChecksBlock";
import { MultipleChecksGoalResponse } from "../../prompts/summarizeCheckGoals";
interface AccountSummaryProps {
  accountName: string;
  passingChecks: number;
  degradedChecks: number;
  failingChecks: number;
  hasIssues: boolean;
  issuesSummary: string;
  failingChecksGoals: MultipleChecksGoalResponse;
  failingCheckIds: string[];
  errorPatterns: { id: string; description: string; count: number }[];
  passingChecksDelta: number;
  degradedChecksDelta: number;
  failingChecksDelta: number;
}

export function createAccountSummaryBlock({
  passingChecks,
  passingChecksDelta,
  degradedChecks,
  degradedChecksDelta,
  failingChecks,
  failingChecksDelta,
  issuesSummary,
  failingChecksGoals,
  failingCheckIds,
  errorPatterns,
  accountName,
}: AccountSummaryProps) {
  const passingChecksDeltaText =
    passingChecksDelta > 0
      ? `(+${passingChecksDelta})`
      : passingChecksDelta < 0
        ? `(${passingChecksDelta})`
        : "";
  const degradedChecksDeltaText =
    degradedChecksDelta > 0
      ? `(+${degradedChecksDelta})`
      : degradedChecksDelta < 0
        ? `(${degradedChecksDelta})`
        : "";
  const failingChecksDeltaText =
    failingChecksDelta > 0
      ? `(+${failingChecksDelta})`
      : failingChecksDelta < 0
        ? `(${failingChecksDelta})`
        : "";

  errorPatterns.sort((a, b) => b.count - a.count);

  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Account "${accountName}" last 24h`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:white_check_mark: *PASSING*: ${passingChecks} ${passingChecksDeltaText}\n :warning: *DEGRADED*: ${degradedChecks} ${degradedChecksDeltaText}\n:x: *FAILING*: ${failingChecks} ${failingChecksDeltaText}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${issuesSummary}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Impact Analysis:*\n${failingChecksGoals.response.length > 0 ? failingChecksGoals.response.map((group, index) => `${index + 1}. *${group.header}*: ${group.description}`).join("\n") : "No failing checks detected in the last 24h."}`,
        },
      },
      ...(errorPatterns.length > 0
        ? [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "*Top 3 Error Patterns:*\n",
              },
            },
            ...errorPatterns.slice(0, 3).flatMap((errorPattern, index) => [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `${index + 1}. \`${errorPattern.description}\` (${errorPattern.count} times)`,
                },
              },
            ]),
          ]
        : []),
      {
        type: "divider",
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              emoji: true,
              text: "Open Checkly Dashboard",
            },
            url: `https://app.checklyhq.com/`,
          },
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
    ],
  };
}
