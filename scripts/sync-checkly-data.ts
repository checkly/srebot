import { ChecklyDataSyncer } from "../src/data-sync/ChecklyDataSyncer";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsedArgs: Record<string, string | boolean | number> = {};

  args.forEach((arg, index) => {
    if (arg.startsWith("--")) {
      const key = arg.replace(/^--/, "");
      const value = args[index + 1]?.startsWith("--")
        ? true
        : (args[index + 1] ?? true);
      parsedArgs[key] = isNaN(Number(value)) ? value : Number(value);
    }
  });

  return parsedArgs;
};

const showHelp = () => {
  console.log(`
Usage: ts-node sync-checkly-data.ts [options]

Options:
  --minutes-back <number>      Number of minutes back to sync (default: 10)
  --sync-check-results         Include check results in sync (default: false)
  --help                       Show this help message

Examples:
  ts-node sync-checkly-data.ts                           # Sync last 10 minutes (default), skip check results
  ts-node sync-checkly-data.ts --minutes-back 30          # Sync last 30 minutes, skip check results
  ts-node sync-checkly-data.ts --sync-check-results       # Sync last 10 minutes (default) and check results
  ts-node sync-checkly-data.ts --minutes-back 15 --sync-check-results  # Sync last 15 minutes and check results
`);
  process.exit(0);
};

const main = async () => {
  // parse arguments
  const args = parseArgs();

  if (args["help"]) {
    showHelp();
  }

  const minutesBack = args["minutes-back"] ? Number(args["minutes-back"]) : 10;
  const syncCheckResults = Boolean(args["sync-check-results"]);

  if (isNaN(minutesBack) || minutesBack <= 0) {
    console.error(
      "❌ Invalid argument. Please provide a positive number of minutes.",
    );
    process.exit(1);
  }

  console.log(`🔄 Syncing data from the last ${minutesBack} minutes...`);

  const daemon = new ChecklyDataSyncer();

  await daemon.syncChecks();
  await daemon.syncCheckGroups();

  if (syncCheckResults) {
    console.log("🔄 Syncing check results...");
    const from = new Date();
    from.setMinutes(from.getMinutes() - minutesBack);

    await daemon.syncCheckResults({
      from: from,
      to: new Date(),
    });

    console.log("✅ Check results sync completed.");
  } else {
    console.log("⚠️ Skipping check results sync.");
  }

  console.log("✅ Sync completed.");
  process.exit(0);
};

main().catch((err) => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
