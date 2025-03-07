import { Check, CheckResult } from "../../checkly/models";
import { CheckTable } from "../../db/check";
import { CheckResultTable } from "../../db/check-results";
import { ErrorClusterTable } from "../../db/error-cluster";
import { SummarizeErrorsPromptType } from "../../prompts/checkly";

export interface CheckBlockProps {
  check: Check | CheckTable;
  failureCount: number;
  errorGroups?: {
    error_message: string;
    error_count: number;
    locations: string[];
  }[];
  checkResults: CheckResult[] | CheckResultTable[];
  frequency: number;
  locations: string[];
}

export function createCheckBlock({
  check,
  failureCount,
  errorGroups = [],
  checkResults,
  frequency,
  locations,
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
            text: `*Frequency*\nevery *${frequency}* minute${frequency || -1 > 1 ? "s" : ""}`,
          },
        ],
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Locations*\n\`${locations.join("\`, \`")}\``,
          },
          {
            type: "mrkdwn",
            text: `*Failure Rate*\n${((failureCount / checkResults.length) * 100).toFixed(2).replace(/\.00$/, "")}% (${failureCount} / ${checkResults.length})`,
          },
        ],
      },
      ...(errorGroups.length === 0
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
                text: `${errorGroups.length > 0 ? "Detected" : "No"} Error Patterns`,
                emoji: true,
              },
            },
          ]),
      ...errorGroups.flatMap((group) => [
        {
          type: "divider",
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Pattern:* \`${group.error_message}\``,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Count*\n*${group.error_count}* failure${group.error_count > 1 ? "s" : ""}`,
            },
            {
              type: "mrkdwn",
              text: `*Affected Locations*\n\`${group.locations.join("\`, \`")}\``,
            },
          ],
        },
      ]),
    ],
  };
}
