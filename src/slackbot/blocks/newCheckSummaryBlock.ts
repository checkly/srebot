interface CheckStats {
  checkName: string;
  checkSummary: string;
  checkState: "PASSING" | "FLAKY" | "FAILING";
  lastFailure: Date;
  failureCount: number;
  successRate: number;
  failurePatterns?: string[];
}

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

  const extraTitlte =
    stats.checkState != "PASSING"
      ? ` - ${stats.failureCount} failures in the last 24 hours`
      : "";

  return {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Check:* ${stats.checkName} (${getStateEmoji(stats.checkState)} ${stats.checkState}${extraTitlte})`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Check summary:* ${stats.checkSummary}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Last failure:* <!date^${Math.floor(stats.lastFailure.getTime() / 1000)}^{ago}|${stats.lastFailure.toLocaleString()}>`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Success Rate:* ${stats.successRate}% in the last 24 hours`,
        },
      },
      ...(stats.failurePatterns && stats.failurePatterns.length > 0
        ? [
            {
              type: "divider",
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Failure Patterns:*
- ${stats.failurePatterns.join("\n - ")}
            `,
              },
            },
          ]
        : []),
    ],
  };
}

export default generateCheckSummaryBlock;
