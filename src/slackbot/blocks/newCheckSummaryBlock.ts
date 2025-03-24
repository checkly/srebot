interface CheckStats {
  checkName: string;
  checkId: string;
  checkSummary: string;
  checkState: "PASSING" | "FLAKY" | "FAILING";
  lastFailure?: Date;
  failureCount: number;
  successRate: number;
  errorPatterns: { id: string; description: string; count: number }[];
  lastFailureId?: string;
  timeLocationSummary: string;
}

const CHECKLY_APP_BASE_URL = "https://app.checklyhq.com/checks/";

function generateCheckSummaryBlock(stats: CheckStats) {
  // Helper to get emoji based on state
  const getStateEmoji = (state: string) => {
    switch (state) {
      case "PASSING":
        return "✅";
      case "FLAKY":
        return "⚠️";
      case "FAILING":
        return "❌";
      default:
        return "❓";
    }
  };

  const extraTitle =
    stats.checkState != "PASSING"
      ? ` - ${stats.failureCount} failures in the last 24 hours`
      : "";

  const checkUrl = `${CHECKLY_APP_BASE_URL}${stats.checkId}`;

  const lastFailureLink = `${checkUrl}/results/${stats.lastFailureId}`;

  const lastFailureSection =
    stats.lastFailure && lastFailureLink
      ? `*Last failure:* <!date^${Math.floor(stats.lastFailure.getTime() / 1000)}^{ago}|${stats.lastFailure.toLocaleString()}> <${lastFailureLink}|view>`
      : `*Last failure:* _No failures in the last 24 hours_`;

  return {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Check:* <${checkUrl}|${stats.checkName}> (${getStateEmoji(stats.checkState)} ${stats.checkState}${extraTitle})
*Check summary:* ${stats.checkSummary}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${lastFailureSection}
*Success Rate:* ${stats.successRate}% in the last 24 hours`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Failures Summary:* ${stats.timeLocationSummary}`,
        },
      },
      ...(stats.errorPatterns && stats.errorPatterns.length > 0
        ? [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Failure Patterns:*`,
              },
            },
            {
              type: "rich_text",
              elements: [
                {
                  type: "rich_text_list",
                  style: "bullet",
                  indent: 0,
                  border: 0,
                  elements: stats.errorPatterns.map((errorPattern) => ({
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
    ],
  };
}

export default generateCheckSummaryBlock;
