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
    "--hours-back <number>",
    "Number of hours back to import",
    (value: string) => {
      const num = Number(value);
      if (isNaN(num) || num <= 0) {
        throw new Error(
          "Invalid argument. Please provide a positive number of hours.",
        );
      }
      return num;
    },
    1,
  )
  .option(
    "--checkly-api-key <string>",
    "Checkly API key",
    process.env.CHECKLY_API_KEY,
  )
  .option(
    "--athena-api-key <string>",
    "Athena API key",
    process.env.CHECKLY_API_KEY,
  )
  .option(
    "--athena-endpoint-url <string>",
    "Athena endpoint URL",
    process.env.ATHENA_ACCESS_ENDPOINT_URL,
  )
  .helpOption("--help", "Show this help message");

program.parse(process.argv);

const options = program.opts();
const accountId = options.accountId;
const hoursBack = options.hoursBack; // Already converted to number by our custom parser
const checklyApiKey = options.checklyApiKey;
const athenaApiKey = options.athenaApiKey;
const athenaEndpointUrl = options.athenaEndpointUrl;

const hoursAgo = (hoursBack: number): Date =>
  new Date(Date.now() - hoursBack * 60 * 60 * 1000);

const main = async () => {
  log.info({ hoursBack, accountId }, "Starting to import data");

  const importer = new AthenaImporter({
    accountId: accountId,
    checklyApiKey: checklyApiKey!,
    athenaApiKey: athenaApiKey!,
    athenaAccessEndpointUrl: athenaEndpointUrl!,
  });

  const fromDate = hoursAgo(hoursBack);
  const toDate = new Date();

  await importer.importAccountData(fromDate, toDate);

  log.info("Import completed.");
  process.exit(0);
};

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
