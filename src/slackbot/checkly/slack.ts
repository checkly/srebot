import { PrometheusCheckMetric, Reporting, Status } from "../../checkly/models";
import { checkly } from "../../checkly/client";
import { checkAttachment, summaryBlock } from "./blocks";
import { featureCoveragePrompt } from "../../prompts/checkly";
import { generateText } from "ai";
import { text } from "express";

export const CHECKLY_COMMAN_NAME = "/checkly";

export const checklyCommandHandler = async ({ ack, respond }) => {
  await ack();

  const metrics = await checkly.getPrometheusCheckStatus();

  const failing = metrics.failing.length;
  const degraded = metrics.degraded.length;
  const passing = metrics.passing.length;

  const { text, blocks } = summaryBlock(failing, degraded, passing);

  await respond({
    text,
    blocks,
  });
};

export const CHECKLY_LIST_CHECKS_ACTION =
  /checkly-list-checks-(failing|degraded|passing)/;

export enum CHECKLY_LIST_CHECKS_ACTIONS {
  FAILING = "checkly-list-checks-failing",
  DEGRADED = "checkly-list-checks-degraded",
  PASSING = "checkly-list-checks-passing",
}

export const checklyListChecksActionHandler = async ({
  action,
  ack,
  respond,
}) => {
  await ack();

  const [rep24h, rep7d, statuses, metrics] = await Promise.all([
    checkly.getReporting({
      quickRange: "last24Hrs",
    }),
    checkly.getReporting({ quickRange: "last7Days" }),
    checkly.getStatuses(),
    checkly.getPrometheusCheckStatus(),
  ]);

  const rep24hMap = rep24h.reduce(
    reduceReporting,
    {} as Record<string, Reporting>,
  );
  const rep7dMap = rep7d.reduce(
    reduceReporting,
    {} as Record<string, Reporting>,
  );

  const statusesMap = statuses.reduce(
    reduceStatus,
    {} as Record<string, Status>,
  );

  const filter = action.action_id as CHECKLY_LIST_CHECKS_ACTIONS;
  let checksToShow: any[];
  let attachmentColor: string;

  switch (filter) {
    case CHECKLY_LIST_CHECKS_ACTIONS.FAILING:
      checksToShow = metrics.failing;
      attachmentColor = "#ff0000"; // Fixed syntax error - changed : to =
      break;
    case CHECKLY_LIST_CHECKS_ACTIONS.DEGRADED:
      checksToShow = metrics.degraded;
      attachmentColor = "#ffa500";
      break;
    case CHECKLY_LIST_CHECKS_ACTIONS.PASSING:
      checksToShow = metrics.passing;
      attachmentColor = "#36a64f";
      break;
    default:
      checksToShow = [];
      attachmentColor = "";
  }

  const attachments = checksToShow
    .map(PrometheusCheckMetric.fromJson)
    .map((m) => ({
      checkRunId: statusesMap[m.checkId].lastCheckRunId,
      checkId: m.checkId,
      check: m.name,
      group: m.group,
      type: m.checkType,
      tags: m.tags,
      success24h: rep24hMap[m.checkId].aggregate.successRatio,
      success7d: rep7dMap[m.checkId].aggregate.successRatio,
      timestamp: new Date(statusesMap[m.checkId].updated_at),
      location: statusesMap[m.checkId].lastRunLocation || "Unknown",
      executionTime: rep7dMap[m.checkId].aggregate.avg,
      executionTimeAvg: rep7dMap[m.checkId].aggregate.avg,
      executionTimeP95: rep7dMap[m.checkId].aggregate.p95,
      executionTimeP99: rep7dMap[m.checkId].aggregate.p99,
    }))
    .map((m) => ({
      color: attachmentColor,
      blocks: checkAttachment(m).blocks,
    }));

  await respond({
    text: "Checks:",
    attachments,
  });

  return;
};

const reduceReporting = (
  acc: Record<string, Reporting>,
  curr: Reporting,
): Record<string, Reporting> => {
  acc[curr.checkId] = curr;
  return acc;
};

const reduceStatus = (
  acc: Record<string, Status>,
  curr: Status,
): Record<string, Status> => {
  acc[curr.checkId] = curr;
  return acc;
};

export const CHECKLY_RUN_CHECK_ACTION = "checkly-run-check";

export const checklyRunCheckActionHandler = async ({
  action,
  ack,
  respond,
}) => {
  await ack();

  await checkly.runCheck(JSON.parse((action as any).value).checkId);

  await respond("Check triggered!");
};

export const CHECKLY_ANALYZE_CHECK_ACTION = "checkly-analyze-check";

export const checklyAnalyzeCheckActionHandler = async ({
  action,
  ack,
  respond,
}) => {
  await ack();

  const checkId = action.value;

  const check = await checkly.getCheck(checkId);
  const lastFailingCheckResult = await checkly.getCheckResults(
    checkId,
    true,
    1,
  );

  if (lastFailingCheckResult.length == 0) {
    await respond(
      `Unable to find failure for check ${checkId}.\n<https://app.checklyhq.com/checks/${checkId}|Open the check in your Browser instead.>`,
    );
    return;
  }

  if (!lastFailingCheckResult[0].browserCheckResult) {
    await respond(
      `Check ${checkId} is not a Browser check.\n<https://app.checklyhq.com/checks/${checkId}|Open the check in your Browser instead.>`,
    );
    return;
  }

  const errors = lastFailingCheckResult[0].browserCheckResult!.errors.map(
    (e) => e.stack,
  );

  const [prompt, config] = featureCoveragePrompt(
    check.name,
    check.scriptPath || "unknown",
    check.script || "unknown",
    errors,
  );
  const { text: summary } = await generateText({
    ...config,
    prompt,
  });

  await respond({
    text: summary,
  });
};
