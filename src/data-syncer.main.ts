import { startSyncingData } from "./data-syncing";
import { log } from "./log";

const main = async () => {
  const signalsToHandle = ["SIGINT", "SIGTERM"];

  signalsToHandle.forEach((signal) => {
    process.on(signal, () => process.exit(0));
  });

  log.info("Starting data syncing");
  await startSyncingData().catch((err) => {
    console.error("Data syncing failed:", err);
  });
  log.info("Finished syncing");
  process.exit(0);
};

main();
