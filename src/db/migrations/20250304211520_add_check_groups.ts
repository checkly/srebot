import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("check_groups", (table) => {
    table.bigInteger("id").primary(); // Unique Checkly Group ID
    table.string("name").notNullable();
    table.integer("concurrency").notNullable().defaultTo(1);
    table.uuid("accountId").notNullable();

    // Default API check settings (stored as JSON)
    table.jsonb("apiCheckDefaults").defaultTo("{}");

    // Alert settings
    table.jsonb("alertSettings").defaultTo("{}");

    // Environment variables (list of key-value pairs)
    table.jsonb("environmentVariables").defaultTo("[]");

    table.integer("setupSnippetId").nullable();
    table.integer("tearDownSnippetId").nullable();
    table.text("localSetupScript").nullable();
    table.text("localTearDownScript").nullable();

    table.boolean("activated").defaultTo(true);
    table.boolean("muted").defaultTo(false);
    table.boolean("useGlobalAlertSettings").defaultTo(true);
    table.boolean("doubleCheck").defaultTo(false);

    // Locations as an array
    table.specificType("locations", "TEXT[]").notNullable();

    table.specificType("tags", "TEXT[]").defaultTo("{}");

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.string("runtimeId").nullable();

    // Retry strategy as JSON
    table.jsonb("retryStrategy").defaultTo("{}");

    table.boolean("runParallel").defaultTo(false);

    // Alert channel subscriptions
    table.jsonb("alertChannelSubscriptions").defaultTo("[]");

    table.specificType("privateLocations", "TEXT[]").defaultTo("{}");

    //  Fetched timestamp for cron tracking
    table.timestamp("fetchedAt").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("check_groups");
}
