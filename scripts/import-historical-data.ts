#!/usr/bin/env ts-node

import { AthenaImporter } from "../src/data-import/AthenaImporter";

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
Usage: ts-node import-historical-data.ts [options]

Options:
  --days-back <number>         Number of days back to import (default: 1)
  --account-id <string>        The account ID to import (required)
  --help                       Show this help message

Examples:
  ts-node import-historical-data.ts --account-id YOUR_ACCOUNT_ID                      # Import last 1 day (default)
  ts-node import-historical-data.ts --account-id YOUR_ACCOUNT_ID --days-back 4        # Import last 2 days
`);
  process.exit(0);
};

const main = async () => {
  // parse arguments
  const args = parseArgs();

  if (args["help"]) {
    showHelp();
  }

  // Require account-id argument
  const accountId = args["account-id"] ? String(args["account-id"]) : undefined;
  if (!accountId) {
    console.error("❌ Missing required argument: --account-id");
    process.exit(1);
  }

  const daysBack = args["days-back"] ? Number(args["days-back"]) : 1;

  if (isNaN(daysBack) || daysBack <= 0) {
    console.error(
      "❌ Invalid argument. Please provide a positive number of days.",
    );
    process.exit(1);
  }

  console.log(
    `🔄 Importing data from the last ${daysBack} day(s) for account ${accountId}...`,
  );

  const importer = new AthenaImporter();

  const fromDate = daysAgo(daysBack);
  const toDate = new Date();

  await importer.importAccountData(accountId, fromDate, toDate);

  console.log("✅ Import completed.");
  process.exit(0);
};

function daysAgo(daysBack: number): Date {
  return new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
}

main().catch((err) => {
  console.error("❌ Import failed:", err);
  process.exit(1);
});
