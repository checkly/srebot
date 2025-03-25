import { formatDistanceToNow } from "date-fns";

export type FailurePattern = {
  id: string;
  description: string;
  count: number;
  firstSeenAt: Date;
};

export type CheckHealth = "PASSING" | "FLAKY" | "FAILING" | "UNKNOWN";

export type CheckStatus = "PASSING" | "FAILING" | "DEGRADED" | "UNKNOWN";

interface CheckStats {
  checkName: string;
  checkId: string;
  checkSummary: string;
  checkHealth: CheckHealth;
  checkStatus: CheckStatus;
  failureCount: number;
  successRate: number;
  errorPatterns: FailurePattern[];

  lastFailureAt?: Date;
  lastFailureId?: string;

  failureAnalysis: string;
  retriesAnalysis?: string;
  degradationsAnalysis?: string;
}

const CHECKLY_APP_BASE_URL = "https://app.checklyhq.com/checks/";

enum COLORS {
  FAILING = "#FF4949",
  DEGRADED = "#FFC82C",
  PASSING = "#13CE66",
  UNKNOWN = "#494746",
}

const getMetadata = (stats: CheckStats): { title: string; color: string } => {
  let prelude = `Check ${stats.checkName}`;
  switch (stats.checkStatus) {
    case "PASSING":
      return { title: `${prelude} - is passing`, color: COLORS.PASSING };
    case "FAILING":
      return { title: `${prelude} - is failing`, color: COLORS.FAILING };
    case "DEGRADED":
      return { title: `${prelude} - is degraded`, color: COLORS.DEGRADED };
    case "UNKNOWN":
      return {
        title: `${prelude} - is in an unknown state`,
        color: COLORS.UNKNOWN,
      };
  }
};

const getCheckHealth = (stats: CheckStats) => {
  switch (stats.checkHealth) {
    case "PASSING":
      return "Healthy";
    case "FLAKY":
      return "Flaky";
    case "FAILING":
      return "Unhealthy";
    case "UNKNOWN":
      return "Unknown";
  }
};

function generateCheckSummaryBlock(stats: CheckStats) {
  const checkUrl = `${CHECKLY_APP_BASE_URL}${stats.checkId}`;
  const lastFailureLink = `${checkUrl}/results/${stats.lastFailureId}`;

  const lastFailureText = stats.lastFailureAt
    ? `<${lastFailureLink}|${formatDistanceToNow(stats.lastFailureAt, { addSuffix: true })}>`
    : "No failures in the last 24 hours";

  const impactAnalysis = [
    stats.failureAnalysis,
    stats.degradationsAnalysis,
    stats.retriesAnalysis,
  ]
    .filter(Boolean)
    .slice(0, 3)
    .map((analysis) => `• ${analysis}`)
    .join("\n");

  const errorPatternsText =
    stats.errorPatterns
      .slice(0, 3)
      .map(
        (pattern, index) =>
          `${index + 1}. \`${pattern.description}\` (${pattern.count} times)\n     _First seen ${formatDistanceToNow(pattern.firstSeenAt, { addSuffix: true })}_`,
      )
      .join("\n") || "_No known error patterns_";

  const availabilityText = `_${stats.failureCount} failure(s) in the last 24 hours_`;

  const actions = [
    {
      name: "check",
      text: "View this check",
      type: "button",
      url: checkUrl,
    },
  ];
  if (stats.lastFailureId) {
    actions.push({
      name: "failure",
      text: "View last failure",
      type: "button",
      url: lastFailureLink,
    });
  }

  const { color, title } = getMetadata(stats);
  return {
    attachments: [
      {
        color,
        title,
        fallback: `Check Summary for ${stats.checkName}`,
        title_link: checkUrl,
        text: [
          `\u200B`,
          stats.checkSummary,
          availabilityText,
          "\n",
          `*Stability:*\n${getCheckHealth(stats)}\n`,
          "*Stability Analysis:*",
          impactAnalysis,
          `\n`,
          "*Top 3 Error Patterns:*",
          errorPatternsText,
          `\u200B`,
          `\u200B`,
        ].join("\n"), // This is ugly as hell, but it's the only way to add a color border to the message
        actions: actions,
        fields: [
          {
            title: "Availability",
            value: `${stats.successRate}%`,
            short: true,
          },
          {
            title: "Last Failed At",
            value: lastFailureText,
            short: true,
          },
        ],
      },
    ],
  };
}

export default generateCheckSummaryBlock;
