import { checkly } from "../../checkly/client";

export type Check = {
  checkId: string;
  checkState: "FAILED" | "DEGRADED" | "PASSED";
  name: string;
  failures: {
    total: number;
    timeframe: string;
  };
  group: string | null;
  lastFailure: {
    checkResultId: string;
    timestamp: Date;
  } | null;
};

export function renderFailingChecksBlock(checks: Check[]) {
  const statusIcon = (checkState: Check["checkState"]) => {
    switch (checkState) {
      case "FAILED":
        return "❌";
      case "DEGRADED":
        return "⚠️";
      case "PASSED":
        return "✅";
    }
  };

  const checkUrl = (checkId: string) => checkly.getCheckAppUrl(checkId);
  const checkResultUrl = (checkId: string, checkResultId: string) =>
    checkly.getCheckResultAppUrl(checkId, checkResultId);
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Failing Checks",
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
            text: "*Check Name*",
          },
          {
            type: "mrkdwn",
            text: "*Failure rate*",
          },
          {
            type: "mrkdwn",
            text: "*Group*",
          },
          {
            type: "mrkdwn",
            text: "*Last failed*",
          },
        ],
      },
      ...checks.map((check) => ({
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `<${checkUrl(check.checkId)}|${statusIcon(check.checkState)} ${check.name}>`,
          },
          {
            type: "mrkdwn",
            text: `${check.failures.total} failure${
              check.failures.total === 1 ? "" : "s"
            } (last ${check.failures.timeframe})`,
          },
          {
            type: "mrkdwn",
            text: check.group || " ",
          },
          {
            type: "mrkdwn",
            text: check.lastFailure
              ? `<!date^${Math.floor(new Date(check.lastFailure.timestamp).getTime() / 1000)}^{ago}|${check.lastFailure.timestamp}> <${checkResultUrl(check.checkId, check.lastFailure.checkResultId)}|Link>`
              : "N/A",
          },
        ],
      })),
    ],
  };
}
