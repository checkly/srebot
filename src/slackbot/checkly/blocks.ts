import {
  CHECKLY_ANALYZE_CHECK_ACTION,
  CHECKLY_LIST_CHECKS_ACTIONS,
  CHECKLY_RUN_CHECK_ACTION,
} from "./slack";

export const summaryBlock = (
  failed: number,
  degraded: number,
  passed: number,
) => {
  return {
    text: `Checkly Production Status: ${failed} Failed | ${degraded} Degraded | ${passed} Passed`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Checkly Production Status",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:x: *${failed}* Failed  |  :warning: *${degraded}* Degraded  |  :white_check_mark: *${passed}* Passed\n`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Failing Checks",
              emoji: true,
            },
            action_id: CHECKLY_LIST_CHECKS_ACTIONS.FAILING,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Degraded Checks",
              emoji: true,
            },
            action_id: CHECKLY_LIST_CHECKS_ACTIONS.DEGRADED,
          },
        ],
      },
    ],
  };
};

export const checkAttachment = ({
  checkId,
  check,
  group,
  type,
  tags,
  success24h,
  success7d,
  timestamp,
  location,
  executionTime,
  executionTimeAvg,
  executionTimeP95,
  executionTimeP99,
}: {
  checkId: string;
  check: string;
  group: string;
  type: string;
  tags: string[];
  success24h: number;
  success7d: number;
  timestamp: Date;
  location: string;
  executionTime: number;
  executionTimeAvg: number;
  executionTimeP95: number;
  executionTimeP99: number;
}) => {
  return {
    blocks: [
      {
        type: "divider",
      },
      {
        type: "header",
        text: {
          type: "plain_text",
          text: check,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Type:* ${type}\n*Group:* ${group}\n*Tags*: ${tags.join(", ")}`,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*When*\n<!date^${Math.floor(timestamp.getTime() / 1000)}^{ago}|${timestamp}>`,
          },
          {
            type: "mrkdwn",
            text: "*Region*\n" + location,
          },
        ],
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Execution Time*\n${executionTime}s (${executionTimeAvg}s Avg | ${executionTimeP95}s P95 | ${executionTimeP99}s P99)`,
          },
          {
            type: "mrkdwn",
            text: `*Reliability*\n${success24h}% in 24h | ${success7d}% in 7d`,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View Check",
              emoji: true,
            },
            url: `https://app.checklyhq.com/checks/${checkId}`,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Run Check",
              emoji: true,
            },
            value: checkId,
            action_id: CHECKLY_RUN_CHECK_ACTION,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Analyze",
              emoji: true,
            },
            value: checkId,
            action_id: CHECKLY_ANALYZE_CHECK_ACTION,
          },
        ],
      },
    ],
  };
};
