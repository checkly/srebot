import postgres from "../db/postgres";
import { checkly } from "../checkly/client";
import { CheckResult } from "../checkly/models";
import { promiseAllWithConcurrency } from "../lib/async-utils";
import { log } from "../log";
import { insertChecks } from "../db/check";
import { insertCheckGroups } from "../db/check-groups";
import { keyBy } from "lodash";

export class ChecklyDataSyncer {
  constructor() {}

  async syncCheckResults({
    from,
    to,
  }: {
    from: Date;
    to: Date;
  }): Promise<CheckResult[]> {
    const startedAt = Date.now();
    const serializeCheckResult = (cr) => ({
      ...cr,
      accountId: checkly.accountId,
      fetchedAt: new Date(),
    });

    const allChecks = await checkly.getChecks();
    const groups = await checkly.getCheckGroups();
    const groupsById = keyBy(groups, "id");

    const checkIds = allChecks
      .filter(
        (c) =>
          c.checkType === "API" ||
          c.checkType === "BROWSER" ||
          c.checkType === "MULTI_STEP",
      )
      .filter((c) => {
        if (c.groupId) {
          const group = groupsById[c.groupId];
          return group && group.activated && c.activated;
        }
        return c.activated;
      })
      .filter((c) => c.frequency >= 5)
      .map((c) => c.id);

    const allResults: CheckResult[] = [];
    for (const checkId of checkIds) {
      for await (const checkResults of checkly.getCheckResultsByCheckIdGenerator(
        checkId,
        {
          resultType: "ALL",
          from,
          to,
          limit: 100,
        },
      )) {
        if (checkResults.length === 0) {
          continue;
        }

        const enrichStartedAt = Date.now();
        const enrichedResults = await promiseAllWithConcurrency(
          checkResults.map((result) => () => this.enrichResult(result)),
          30,
        );
        log.debug(
          {
            duration_ms: Date.now() - enrichStartedAt,
            enriched_count: enrichedResults.length,
          },
          "Results batch enriched",
        );

        await postgres("check_results")
          .insert(enrichedResults.map(serializeCheckResult))
          .onConflict("id")
          .merge();
        allResults.push(...enrichedResults);
      }

      log.info(
        {
          count: allResults.length,
          duration_ms: Date.now() - startedAt,
          checkId,
        },
        "Check Results synced",
      );
    }
    return allResults;
  }

  private async enrichResult(checkResult: CheckResult): Promise<CheckResult> {
    const isFailing = checkResult.hasErrors || checkResult.hasFailures;
    if (!isFailing) {
      return checkResult;
    }
    return checkly.getCheckResult(checkResult.checkId, checkResult.id);
  }

  async syncChecks() {
    const startedAt = Date.now();
    const allChecks = await checkly.getChecks();

    await insertChecks(allChecks);

    // Remove checks that no longer exist
    const checkIds = allChecks.map((check) => check.id);
    await postgres("checks")
      .delete()
      .whereNotIn("id", checkIds)
      .where("accountId", checkly.accountId);

    log.info(
      {
        count: allChecks.length,
        duration_ms: Date.now() - startedAt,
      },
      "Checks synced",
    );
  }

  async syncCheckGroups() {
    const startedAt = Date.now();

    const allGroups = await checkly.getCheckGroups();
    await insertCheckGroups(allGroups);

    // Remove checks that no longer exist
    const groupIds = allGroups.map((check) => check.id);
    await postgres("check_groups")
      .delete()
      .whereNotIn("id", groupIds)
      .where("accountId", checkly.accountId);

    log.info(
      {
        count: allGroups.length,
        duration_ms: Date.now() - startedAt,
      },
      "Check Groups synced",
    );
  }
}
