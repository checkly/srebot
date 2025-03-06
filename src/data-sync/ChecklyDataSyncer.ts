import postgres from "../db/postgres";
import { checkly } from "../checkly/client";
import { Check, CheckGroup } from "../checkly/models";
import { log } from "../slackbot/log";

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

    let synchronizedResults = 0;
    for (const checkId of checkIds) {
      const checkResults = await checkly.getCheckResultsByCheckId(checkId, {
        resultType: "ALL",
        from,
        to,
        limit: 100,
      });

      for (let checkResult of checkResults) {
        const isFailing = checkResult.hasErrors || checkResult.hasFailures;
        if (isFailing) {
          checkResult = await checkly.getCheckResult(checkId, checkResult.id);
        }

        await postgres("check_results")
          .insert(serializeCheckResult(checkResult))
          .onConflict("id")
          .merge();
        synchronizedResults++;

        if (synchronizedResults % 100 === 0) {
          log.info(
            {
              count: synchronizedResults,
              duration_ms: Date.now() - startedAt,
            },
            "Check result batch synced",
          );
        }
      }
    }

    log.info(
      {
        count: synchronizedResults,
        duration_ms: Date.now() - startedAt,
      },
      "Check Results synced",
    );
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
