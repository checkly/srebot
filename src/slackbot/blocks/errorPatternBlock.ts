import { ErrorClusterWithCount } from "../../db/error-cluster";

export const LIST_ERROR_PATTERNS_ACTION_ID = "list_error_patterns";

export function createErrorPatternsBlock(
  errorPatterns: ErrorClusterWithCount[],
) {
  errorPatterns.forEach((errorPattern) => {
    console.log(errorPattern.error_message);
  });
  return {
    blocks: [
      {
        text: {
          emoji: true,
          text: "Error Pattern - Top 20",
          type: "plain_text",
        },
        type: "header",
      },
      {
        type: "divider",
      },
      ...(errorPatterns.length > 0
        ? [
            {
              text: {
                text: "*(Count) Summary*\n*Pattern Details*",
                type: "mrkdwn",
              },
              type: "section",
            },
            ...errorPatterns.slice(0, 20).flatMap((errorPattern) => [
              {
                text: {
                  text: `*(${errorPattern.count}) ${errorPattern.error_message.split("\n")[0]}*\n\`\`\`${errorPattern.error_message.replaceAll('"', "")}\`\`\``,
                  type: "mrkdwn",
                },
                type: "section",
              },
              {
                type: "divider",
              },
            ]),
          ]
        : [
            {
              text: {
                text: "No error Pattern found",
                type: "plain_text",
              },
              type: "section",
            },
          ]),
    ],
  };
}
