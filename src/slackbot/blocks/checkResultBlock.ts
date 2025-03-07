import { Check, CheckResult } from "../../checkly/models";
import { SummarizeErrorsPromptType } from "../../prompts/checkly";

export interface CheckResultBlockProps {
  check: Check;
  checkAppUrl: string;
  checkResult: CheckResult;
  checkResultAppUrl: string;
  errorGroups: SummarizeErrorsPromptType;
  failingCheckResults: CheckResult[];
  intervalStart: Date;
}

export function createCheckResultBlock({
  check,
  checkAppUrl,
  checkResult,
  checkResultAppUrl,
  errorGroups,
  failingCheckResults,
  intervalStart,
}: CheckResultBlockProps) {
  const errorGroup = errorGroups.groups.find(
    (g) => g.checkResults.indexOf(checkResult.id) > -1,
  );

  return {
    text: `*Check Result Details*`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Check Result Details",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Check Name:*\n<${checkAppUrl}|${check.name}>`,
          },
          {
            type: "mrkdwn",
            text: `*Timestamp:*\n${intervalStart.toISOString()}`,
          },
          {
            type: "mrkdwn",
            text: `*Location:*\n\`${checkResult.runLocation}\``,
          },
          {
            type: "mrkdwn",
            text: `*Check Result:*\n<${checkResultAppUrl}|Link>`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Error Message:*\n\`${errorGroup?.errorMessage}\`\n\n*Similar Failures:*\nThis error occurred \`${errorGroup?.checkResults.length} times\` across locations: \`${check.locations.join("\`, \`")}\`. We saw \`${errorGroups.groups.length} Error Groups\` in total with \`${failingCheckResults.length} failures\` in the same timeframe.`,
        },
      },
    ],
  };
}
