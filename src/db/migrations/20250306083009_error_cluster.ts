import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("error_cluster", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable();
    table.text("error_message").notNullable();
    table.timestamp("first_seen_at").notNullable();
    table.timestamp("last_seen_at").notNullable();
    table.specificType("embedding", "vector(1536)").notNullable();
    table.string("embedding_model").notNullable();

    table.index(["account_id"]);
  });

  await knex.schema.raw(
    `CREATE INDEX idx_error_cluster_embedding ON error_cluster USING hnsw (embedding vector_l2_ops)`,
  );

  await knex.schema.createTable("error_cluster_membership", (table) => {
    table.string("error_id").notNullable();
    table.string("result_check_id").notNullable();
    table.timestamp("date").notNullable();
    table.specificType("embedding", "float[]").notNullable();
    table.string("embedding_model").notNullable();

    // Create a composite primary key
    table.primary(["error_id", "result_check_id"]);

    table.index(["error_id", "date"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("error_cluster_membership");
  await knex.schema.dropTable("error_cluster");
}
