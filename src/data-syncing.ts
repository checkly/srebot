import timers from "node:timers/promises";
import { PublicApiImporter } from "./data-import/PublicApiImporter";

let shouldRun = true;

const syncChecksAndGroups = async (syncer: PublicApiImporter) => {
  while (shouldRun) {
    try {
      await syncer.syncChecks();
      await syncer.syncCheckGroups();
    } catch (err) {
      console.error(`msg="Syncing Checks or Check Groups failed" err=`, err);
    } finally {
      await timers.setTimeout(60_000);
    }
  }
};

const syncCheckResults = async (syncer: PublicApiImporter) => {
  while (shouldRun) {
    const startedAt = Date.now();
    try {
      const minutesBackToSync = 24 * 60;
      await syncer.syncCheckResults(minutesBackToSync);
    } catch (err) {
      console.error(`msg="Syncing Check Results failed" err=`, err);
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs < 60_000) {
        await timers.setTimeout(60_000 - durationMs);
      }
    }
  }
};

export const startSyncingData = async () => {
  const importer = new PublicApiImporter();

  const checksAndGroups = syncChecksAndGroups(importer);
  const checkResults = syncCheckResults(importer);

  const signalsToHandle = ["SIGINT", "SIGTERM"];

  signalsToHandle.forEach((signal) => {
    process.on(signal, () => {
      shouldRun = false;
    });
  });

  await Promise.all([checksAndGroups, checkResults]);
};
