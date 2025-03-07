import postgres from "../db/postgres";
import { checkly } from "../checkly/client";
import { Check, CheckGroup, CheckResult } from "../checkly/models";
import { log } from "../slackbot/log";
import { promiseAllWithConcurrency } from "../lib/async-utils";

export class ChecklyDataSyncer {
  constructor() {}

  async syncCheckResults({ from, to }: { from: Date; to: Date }) {
    const startedAt = Date.now();
    const serializeCheckResult = (cr) => ({
      ...cr,
      accountId: checkly.accountId,
      fetchedAt: new Date(),
    });

    const allChecks = await checkly.getChecks();
    const checkIds = allChecks.map((c) => c.id);

    let totalSynchronized = 0;
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
        totalSynchronized += enrichedResults.length;
      }

      log.info(
        {
          count: totalSynchronized,
          duration_ms: Date.now() - startedAt,
          checkId,
        },
        "Check Results synced",
      );
    }
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

    const serializeCheck = (check: Check) => ({
      ...check,
      alertChannelSubscriptions: JSON.stringify(
        check.alertChannelSubscriptions,
      ),
      accountId: checkly.accountId,
      fetchedAt: new Date(),
    });

    await postgres("checks")
      .insert(allChecks.map(serializeCheck))
      .onConflict("id")
      .merge();

    // Remove checks that no longer exist
    const checkIds = allChecks.map((check) => check.id);
    await postgres("checks").delete().whereNotIn("id", checkIds);

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
    const allCheckGroups = await checkly.getCheckGroups();

    const serializeCheckGroup = (group: CheckGroup) => ({
      ...group,
      alertChannelSubscriptions: JSON.stringify(
        group.alertChannelSubscriptions,
      ),
      accountId: checkly.accountId,
      fetchedAt: new Date(),
    });

    const allGroups = await checkly.getCheckGroups();
    await postgres("check_groups")
      .insert(allGroups.map(serializeCheckGroup))
      .onConflict("id")
      .merge();

    // Remove checks that no longer exist
    const groupIds = allCheckGroups.map((check) => check.id);
    await postgres("check_groups").delete().whereNotIn("id", groupIds);

    log.info(
      {
        count: allCheckGroups.length,
        duration_ms: Date.now() - startedAt,
      },
      "Check Groups synced",
    );
  }
}
