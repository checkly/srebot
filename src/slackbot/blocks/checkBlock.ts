import { Check, CheckResult } from "../../checkly/models";
import { SummarizeErrorsPromptType } from "../../prompts/checkly";

export interface CheckBlockProps {
  check: Check;
  failureCount: number;
  errorGroups?: SummarizeErrorsPromptType;
  checkResults: CheckResult[];
}

export function createCheckBlock({
  check,
  failureCount,
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
            text: `*Type*\n${
              {
                BROWSER: "Browser Check",
                API: "API Check",
                MULTI_STEP: "Multi-Step Check",
              }[check.checkType]
            }`,
          },
          {
            type: "mrkdwn",
            text: `*Frequency*\nevery *${check.frequency}* minute${check.frequency > 1 ? "s" : ""}`,
          },
        ],
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Locations*\n\`${check.locations.join("\`, \`")}\``,
          },
          {
            type: "mrkdwn",
            text: `*Failure Rate*\n${((failureCount / checkResults.length) * 100).toFixed(2).replace(/\.00$/, "")}% (${failureCount} / ${checkResults.length})`,
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
              text: `*Count*\n*${group.checkResults.length}* failure${group.checkResults.length > 1 ? "s" : ""}`,
            },
            {
              type: "mrkdwn",
              text: `*Affected Locations*\n\`${[
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
