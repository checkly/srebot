import timers from "node:timers/promises";
import { PublicApiImporter } from "./data-import/PublicApiImporter";

let shouldRun = true;

const syncChecksAndGroups = async (syncer: PublicApiImporter) => {
  while (shouldRun) {
    try {
      await syncer.syncChecks();
      await syncer.syncCheckGroups();
    } catch (err) {
      console.error("❌ Sync failed:", err);
    } finally {
      await timers.setTimeout(60_000);
    }
  }
};

const syncCheckResults = async (syncer: PublicApiImporter) => {
  while (shouldRun) {
    try {
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await syncer.syncCheckResults({
        from: from,
        to: new Date(),
      });
    } catch (err) {
      console.error("❌ Sync failed:", err);
    } finally {
      await timers.setTimeout(10_000);
    }
  }
};

export const startSyncingData = async () => {
  const importer = new PublicApiImporter();

  const checksAndGroups = syncChecksAndGroups(importer);
  const checkResults = syncCheckResults(importer);

  await Promise.all([checksAndGroups, checkResults]);
};
