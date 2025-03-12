#!/usr/bin/env ts-node

import { Command } from "commander";
import { AthenaImporter } from "../src/data-import/AthenaImporter";
import { log } from "../src/log";
import { initConfig } from "../src/lib/init-config";

initConfig();

const program = new Command();

program
  .name("import-historical-data")
  .description("Import historical data for an account")
  .requiredOption("--account-id <string>", "The account ID to import")
  .option(
    "--days-back <number>",
    "Number of days back to import",
    (value: string) => {
      const num = Number(value);
      if (isNaN(num) || num <= 0) {
        throw new Error(
          "Invalid argument. Please provide a positive number of days.",
        );
      }
      return num;
    },
    1,
  )
  .helpOption("--help", "Show this help message");

program.parse(process.argv);

const options = program.opts();
const accountId = options.accountId;
const daysBack = options.daysBack; // Already converted to number by our custom parser

const daysAgo = (daysBack: number): Date =>
  new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

const main = async () => {
  log.info({ daysBack, accountId }, `Starting to import data`);

  const importer = new AthenaImporter({
    accountId: accountId,
    checklyApiKey: process.env.CHECKLY_API_KEY!,
    athenaApiKey: process.env.CHECKLY_API_KEY!,
    athenaAccessEndpointUrl: process.env.ATHENA_ACCESS_ENDPOINT_URL!,
  });

  const fromDate = daysAgo(daysBack);
  const toDate = new Date();

  await importer.importAccountData(fromDate, toDate);

  log.info("Import completed.");
  process.exit(0);
};

main().catch((err) => {
  console.error("Import failed:", err); // For some reason log.error is serialising the error as [Object object]
  process.exit(1);
});
