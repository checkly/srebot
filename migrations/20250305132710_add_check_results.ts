import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("check_results", (table) => {
    table.uuid("id").primary(); // Unique result ID
    table.uuid("checkId").notNullable().index(); // References the check that was run
    table.uuid("accountId").notNullable();
    table.bigInteger("checkRunId").notNullable(); // Unique run identifier
    table.string("name").notNullable(); // Name of the check
    table.boolean("hasErrors").defaultTo(false);
    table.boolean("hasFailures").defaultTo(false);
    table.string("runLocation").notNullable(); // e.g., "eu-central-1"

    table.timestamp("startedAt").notNullable();
    table.timestamp("stoppedAt").notNullable();
    table.integer("responseTime").notNullable(); // Response time in ms

    table.integer("attempts").defaultTo(1);
    table.boolean("isDegraded").defaultTo(false);
    table.boolean("overMaxResponseTime").defaultTo(false);
    table.uuid("sequenceId").notNullable(); // Sequence of check runs
    table.string("resultType").notNullable(); // e.g., "FINAL"

    // Store full multi-step check result
    table.jsonb("multiStepCheckResult").defaultTo("{}");
    table.jsonb("apiCheckResult").defaultTo("{}");
    table.jsonb("browserCheckResult").defaultTo("{}");

    table.timestamp("created_at");

    // ✅ Embedding for vector search
    table.specificType("embedding", "vector(1536)").nullable();
    table.string("embeddingModel").nullable();

    table.timestamp("fetchedAt").nullable();
  });

  await knex.raw(
    `CREATE INDEX idx_check_results_embedding ON check_results USING hnsw (embedding vector_l2_ops);`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_check_results_embedding;");
  await knex.schema.dropTableIfExists("check_results");
}
