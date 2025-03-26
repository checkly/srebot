import { ErrorClusterWithCount } from "../../db/error-cluster";

export const LIST_ERROR_PATTERNS_ACTION_ID = "list_error_patterns";

export function createErrorPatternsBlock(
  errorPatterns: ErrorClusterWithCount[],
) {
  return {
    text: "Error Patterns - Top 20",
    blocks: [
      {
        text: {
          emoji: true,
          text: "Error Patterns - Top 20",
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
                  text: `*(${errorPattern.count}) ${errorPattern.error_message.split("\n")[0]}*
_Last seen: <!date^${Math.floor(errorPattern.last_seen_at.getTime() / 1000)}^{ago}|${errorPattern.last_seen_at.toISOString()}> | First seen: <!date^${Math.floor(errorPattern.first_seen_at.getTime() / 1000)}^{ago}|${errorPattern.first_seen_at.toISOString()}>_
\`\`\`${errorPattern.error_message.replaceAll('"', "")}\`\`\``,
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
