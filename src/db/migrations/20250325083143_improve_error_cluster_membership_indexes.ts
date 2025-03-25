import type { Knex } from "knex";

const NEW_INDEX_NAME = "error_cluster_membership_date_error_id_check_id_idx";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS ${NEW_INDEX_NAME} ON error_cluster_membership ("date", "error_id", "check_id")`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`DROP INDEX IF EXISTS ${NEW_INDEX_NAME}`);
}
