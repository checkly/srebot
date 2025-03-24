import timers from "node:timers/promises";
import { PublicApiImporter } from "./data-import/PublicApiImporter";
import { NotionImporter } from "./data-import/NotionImporter";

let shouldRun = true;

const syncChecksAndGroups = async (
  syncer: PublicApiImporter,
  targetInterval: number,
) => {
  while (shouldRun) {
    const startedAt = Date.now();
    try {
      await syncer.syncChecks();
      await syncer.syncCheckGroups();
    } catch (err) {
      console.error(`msg="Syncing Checks or Check Groups failed" err=`, err);
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs < targetInterval) {
        await timers.setTimeout(targetInterval - durationMs);
      }
    }
  }
};

const syncCheckResults = async (
  syncer: PublicApiImporter,
  targetInterval: number,
) => {
  while (shouldRun) {
    const startedAt = Date.now();
    try {
      const minutesBackToSync = 24 * 60;
      await syncer.syncCheckResults(minutesBackToSync);
    } catch (err) {
      console.error(`msg="Syncing Check Results failed" err=`, err);
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs < targetInterval) {
        await timers.setTimeout(targetInterval - durationMs);
      }
    }
  }
};

const syncNotionData = async (
  notionImporter: NotionImporter,
  targetInterval: number,
) => {
  while (shouldRun) {
    const startedAt = Date.now();
    try {
      await notionImporter.importNotion();
    } catch (err) {
      console.error(`msg="Syncing Data from Notion" err=`, err);
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs < targetInterval) {
        await timers.setTimeout(targetInterval - durationMs);
      }
    }
  }
};

export const startSyncingData = async () => {
  const importer = new PublicApiImporter();
  const notionImporter = new NotionImporter();

  const checksAndGroups = syncChecksAndGroups(importer, 60_000);
  const checkResults = syncCheckResults(importer, 60_000);
  const syncNotion = syncNotionData(notionImporter, 5 * 60_000); // 5 minutes. this can be configured later

  const signalsToHandle = ["SIGINT", "SIGTERM"];

  signalsToHandle.forEach((signal) => {
    process.on(signal, () => {
      shouldRun = false;
    });
  });

  await Promise.all([checksAndGroups, checkResults, syncNotion]);
};
