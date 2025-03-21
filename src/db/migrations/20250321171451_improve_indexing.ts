import type { Knex } from "knex";

const INDEX_STARTED_AT_CHECK_ID_ACCOUNT_ID =
  "check_results_startedat_checkid_accountid_idx";
const INDEX_CHECK_RESULTS_CHECKID = "check_results_checkid_index";
const INDEX_IDX_CHECK_RESULTS_LATEST = "idx_check_results_latest";
const INDEX_CHECK_RESULTS_QUERY = "check_results_query_index";
const INDEX_STARTED_AT_RUN_LOCATION_CHECK_ID =
  "check_results_aggregation_index";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS ${INDEX_STARTED_AT_CHECK_ID_ACCOUNT_ID} ON check_results ("startedAt", "checkId", "accountId")`,
  );

  await knex.schema.raw(`DROP INDEX IF EXISTS ${INDEX_CHECK_RESULTS_CHECKID}`);
  await knex.schema.raw(
    `DROP INDEX IF EXISTS ${INDEX_IDX_CHECK_RESULTS_LATEST}`,
  );
  await knex.schema.raw(`DROP INDEX IF EXISTS ${INDEX_CHECK_RESULTS_QUERY}`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(
    `DROP INDEX IF EXISTS ${INDEX_STARTED_AT_CHECK_ID_ACCOUNT_ID}`,
  );

  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS ${INDEX_CHECK_RESULTS_CHECKID} ON public.check_results ("checkId")`,
  );
  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS ${INDEX_IDX_CHECK_RESULTS_LATEST} ON public.check_results ("checkId" ASC, "startedAt" DESC)`,
  );
  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS ${INDEX_CHECK_RESULTS_QUERY} ON public.check_results ("accountId" ASC, "checkId" ASC, "startedAt" DESC)`,
  );
  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS ${INDEX_STARTED_AT_RUN_LOCATION_CHECK_ID} ON public.check_results ("checkId" ASC, "runLocation" ASC, "startedAt" DESC)`,
  );
}
