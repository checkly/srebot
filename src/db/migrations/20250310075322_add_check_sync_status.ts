import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("check_sync_status", (table) => {
    table.uuid("checkId").primary();
    table.uuid("accountId").notNullable();

    table.timestamp("from").notNullable(); // Start of the synced timeframe
    table.timestamp("to").notNullable(); // End of the synced timeframe

    table.timestamp("syncedAt").notNullable().defaultTo(knex.fn.now()); // Timestamp when it was last updated
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("check_sync_status");
}
