import postgres from "../common/connections/postgres";
import { checkly } from "../checkly/client";
import { Check, CheckGroup } from "../checkly/models";

export class ChecklyDataSyncer {
  constructor() {}

  async syncCheckResults({ from, to }: { from: Date; to: Date }) {
    const startedAt = Date.now();
    const serialiseCheckResult = (cr) => ({
      ...cr,
      accountId: checkly.accountId,
      fetchedAt: new Date(),
    });

    const allChecks = await checkly.getChecks();
    const checkIds = allChecks.map((c) => c.id);

    let synchronizedResults = 0;
    for (const checkId of checkIds) {
      const items = await checkly.getCheckResultsByCheckId(checkId, {
        resultType: "ALL",
        from,
        to,
        limit: 100,
      });

      for (const result of items) {
        const isFailing = result.hasErrors || result.hasFailures;
        let resultToInsert = result;

        if (isFailing) {
          resultToInsert = await checkly.getCheckResult(checkId, result.id);
        }

        await postgres("check_results")
          .insert(serialiseCheckResult(resultToInsert))
          .onConflict("id")
          .merge();
        synchronizedResults++;

        if (synchronizedResults % 100 === 0) {
          console.log(
            `msg="Check result batch synced" count=${synchronizedResults} duration_ms=${Date.now() - startedAt}`,
          );
        }
      }
    }

    console.log(
      `msg="Check Results synced" count=${synchronizedResults} duration_ms=${Date.now() - startedAt}`,
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
      .insert(allChecks.map((check) => serializeCheck(check)))
      .onConflict("id")
      .merge();

    // Remove checks that no longer exist
    const checkIds = allChecks.map((check) => check.id);
    await postgres("checks").delete().whereNotIn("id", checkIds);

    console.log(
      `msg="Checks synced" count=${checkIds.length} duration_ms=${Date.now() - startedAt}`,
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
      .insert(allGroups.map((group) => serializeCheckGroup(group)))
      .onConflict("id")
      .merge();

    // Remove checks that no longer exist
    const groupIds = allCheckGroups.map((check) => check.id);
    await postgres("check_groups").delete().whereNotIn("id", groupIds);

    console.log(
      `msg="Check Groups synced" count=${groupIds.length} duration_ms=${Date.now() - startedAt}`,
    );
  }
}
