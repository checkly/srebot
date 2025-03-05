import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("checks", (table) => {
    table.uuid("id").primary(); // Unique Checkly ID
    table.uuid("accountId").notNullable().index(); // Account UUID
    table.string("checkType").notNullable(); // e.g., BROWSER, API
    table.string("name").notNullable();
    table.integer("frequency").notNullable();
    table.integer("frequencyOffset").notNullable();
    table.boolean("activated").defaultTo(true);
    table.boolean("muted").defaultTo(false);
    table.boolean("shouldFail").defaultTo(false);

    table.specificType("locations", "TEXT[]").notNullable();
    table.text("script").nullable();
    table.timestamp("created_at");
    table.timestamp("updated_at");

    table.boolean("doubleCheck").defaultTo(false);
    table.specificType("tags", "TEXT[]").defaultTo("{}");
    table.string("sslCheckDomain").nullable();
    table.integer("setupSnippetId").nullable();
    table.integer("tearDownSnippetId").nullable();
    table.text("localSetupScript").nullable();
    table.text("localTearDownScript").nullable();

    table.jsonb("alertSettings").defaultTo("{}");
    table.boolean("useGlobalAlertSettings").defaultTo(true);

    table.integer("degradedResponseTime").nullable();
    table.integer("maxResponseTime").nullable();

    table.integer("groupId").nullable();
    table.integer("groupOrder").defaultTo(0);
    table.string("runtimeId").nullable();
    table.string("scriptPath").nullable();
    table.jsonb("retryStrategy").defaultTo("{}");
    table.jsonb("request").defaultTo("{}");
    table.boolean("runParallel").defaultTo(false);
    table.jsonb("alertChannelSubscriptions").defaultTo("[]");
    table.specificType("privateLocations", "TEXT[]").defaultTo("{}");
    table.jsonb("dependencies").defaultTo("[]");
    table.jsonb("environmentVariables").defaultTo("[]");

    //  Embedding for vector search
    table.specificType("embedding", "vector(1536)").nullable();
    table.string("embeddingModel").nullable();

    // Checkly specific fields
    table.timestamp("fetchedAt").nullable(); // Last fetch time

    // Indexes for performance
    table.index(["groupId"]);
  });

  await knex.schema.raw(
    `CREATE INDEX idx_checks_embedding ON checks USING hnsw (embedding vector_l2_ops)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("checks");
}
