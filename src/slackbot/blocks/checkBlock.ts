import { Check, CheckResult } from "../../checkly/models";
import { SummarizeErrorsPromptType } from "../../prompts/checkly";

export interface CheckBlockProps {
  check: Check;
  checkAppUrl: string;
  errorGroups?: SummarizeErrorsPromptType;
  checkResults: CheckResult[];
}

export function createCheckBlock({
  check,
  checkAppUrl,
  errorGroups = { groups: [] },
  checkResults,
}: CheckBlockProps) {
  return {
    text: `*Check Details*`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${check.name} - Last 24 hours`,
          emoji: true,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Type:*\n${check.checkType.charAt(0).toUpperCase() + check.checkType.slice(1).toLowerCase()}`,
          },
          {
            type: "mrkdwn",
            text: `*Frequency:*\nevery \`${check.frequency}\` minute${check.frequency > 1 ? "s" : ""}`,
          },
          {
            type: "mrkdwn",
            text: `*Locations:*\n\`${check.locations.join("\`, \`")}\``,
          },
          {
            type: "mrkdwn",
            text: `*Link:*\n<${checkAppUrl}|Link>`,
          },
        ],
      },
      ...(errorGroups.groups.length === 0
        ? [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*No errors happened in the last 24 hours*`,
              },
            },
          ]
        : [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `${errorGroups.groups.length > 0 ? "Detected" : "No"} Error Patterns`,
                emoji: true,
              },
            },
          ]),
      ...errorGroups.groups.flatMap((group) => [
        {
          type: "divider",
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Pattern:* \`${group.errorMessage}\``,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Count:* \`${group.checkResults.length}\` failure${group.checkResults.length > 1 ? "s" : ""}`,
            },
            {
              type: "mrkdwn",
              text: `*Affected Locations:* \`${[
                ...new Set(
                  group.checkResults.map(
                    (id) => checkResults.find((r) => r.id === id)?.runLocation,
                  ),
                ),
              ]
                .filter(Boolean)
                .join("\`, \`")}\``,
            },
          ],
        },
      ]),
    ],
  };
}
