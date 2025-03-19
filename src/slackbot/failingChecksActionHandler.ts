import { readChecksWithGroupNames } from "../db/check";
import { findCheckResults } from "../db/check-results";
import { last24h } from "../prompts/checkly-data";
import * as dataForge from "data-forge";
import { renderFailingChecksBlock } from "./blocks/failingChecksBlock";

export const showFailingChecksActionHandler = () => {
  return async ({ ack, respond, body }) => {
    await ack();
    const interval = last24h(new Date());
    const checkIds = (body.actions[0].value as string).split(",");
    const groupNamesForCheckIds = (
      await readChecksWithGroupNames(checkIds)
    ).reduce(
      (acc, check) => {
        acc[check.id] = check.groupName;
        return acc;
      },
      {} as Record<string, string>,
    );

    const checkResults = await findCheckResults(
      checkIds,
      interval.from,
      interval.to,
    );

    const checkResultsDF = new dataForge.DataFrame(checkResults);

    const failedChecks = checkResultsDF
      .groupBy((cr) => cr.checkId)
      .map((group) => ({
        checkId: group.first().checkId,
        checkState: (group.first().hasFailures || group.first().hasErrors
          ? "FAILED"
          : group.first().isDegraded
            ? "DEGRADED"
            : "PASSED") as "FAILED" | "DEGRADED" | "PASSED",
        name: group.first().name,
        failures: {
          total: group
            .deflate((cr) => (cr.hasFailures || cr.hasErrors ? 1 : 0))
            .sum(),
          timeframe: "24h",
        },
        group: groupNamesForCheckIds[group.first().checkId],
        lastFailure: (() => {
          const lastFailure = group
            .where((cr) => cr.hasFailures || cr.hasErrors || cr.isDegraded)
            .orderBy((cr) => cr.startedAt)
            .last();
          return lastFailure
            ? {
                checkResultId: lastFailure.id,
                timestamp: lastFailure.startedAt,
              }
            : null;
        })(),
      }))
      .toArray();

    const message = renderFailingChecksBlock(failedChecks);
    await respond({ response_type: "in_channel", ...message });
  };
};
