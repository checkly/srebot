import { formatDistanceToNow } from "date-fns";

export type FailurePattern = {
  id: string;
  description: string;
  count: number;
  firstSeenAt: Date;
};

type CheckState = "PASSING" | "FLAKY" | "FAILING" | "UNKNOWN";

interface CheckStats {
  checkName: string;
  checkId: string;
  checkSummary: string;
  checkState: CheckState;
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
  FLAKY = "#FFC82C",
  PASSING = "#13CE66",
  UNKNOWN = "#494746",
}

const getMetadata = (stats: CheckStats): { title: string; color: string } => {
  let prelude = `Check ${stats.checkName}`;
  switch (stats.checkState) {
    case "PASSING":
      return { title: `${prelude} - is passing`, color: COLORS.PASSING };
    case "FAILING":
      return { title: `${prelude} - is failing`, color: COLORS.FAILING };
    case "FLAKY":
      return { title: `${prelude} - is flaky`, color: COLORS.FLAKY };
    case "UNKNOWN":
      return {
        title: `${prelude} - is in an unknown state`,
        color: COLORS.UNKNOWN,
      };
  }
};

function formatColumnLayout(
  items: [string, string][],
  columnWidth: number = 40,
): string {
  // Separate headers and values
  const headers = items.map(([header]) => {
    const cleanHeader = header.replace(/[*_~`]/g, "");
    return `*${cleanHeader}*`;
  });

  const values = items.map(([, value]) => value);

  // Create header row
  const headerRow = headers
    .slice(0, -1)
    .map((header) => header.padEnd(columnWidth))
    .concat(headers.slice(-1))
    .join("");

  // Create value row
  const valueRow = values.join(" ".repeat(columnWidth));

  return `${headerRow}\n${valueRow}`;
}

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

  const statusText = `_${stats.failureCount} failure(s) in the last 24 hours_`;

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
          statusText,
          `\n`,
          formatColumnLayout(
            [
              ["Availability:", `${stats.successRate}%`],
              ["Last failed at:", lastFailureText],
            ],
            80,
          ),
          `\n`,
          "*Impact Analysis:*",
          impactAnalysis,
          `\n`,
          "*Top 3 Error Patterns:*",
          errorPatternsText,
        ].join("\n"),
        actions: actions,
      },
    ],
  };
}

export default generateCheckSummaryBlock;
