import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("checks", (table) => {
    table.uuid("id").primary(); // Unique Checkly ID
    table.uuid("accountId").notNullable().index(); // Account UUID
    table.string("checkType").notNullable(); // e.g., BROWSER, API
    table.string("name").notNullable();
    table.integer("frequency").nullable();
    table.integer("frequencyOffset").nullable();
    table.boolean("activated").defaultTo(true);
    table.boolean("muted").defaultTo(false);
    table.boolean("shouldFail").defaultTo(false);

    table.specificType("locations", "TEXT[]").nullable();
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
    table.string("heartbeat").nullable();
    table.string("runtimeId").nullable();
    table.string("scriptPath").nullable();
    table.jsonb("retryStrategy").defaultTo("{}");
    table.jsonb("request").defaultTo("{}");
    table.boolean("runParallel").defaultTo(false);
    table.jsonb("alertChannelSubscriptions").defaultTo("[]");
    table.specificType("privateLocations", "TEXT[]").defaultTo("{}");
    table.jsonb("dependencies").defaultTo("[]");
    table.jsonb("environmentVariables").defaultTo("[]");

    // Checkly specific fields
    table.timestamp("fetchedAt").nullable(); // Last fetch time

    // Indexes for performance
    table.index(["groupId"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("checks");
}
