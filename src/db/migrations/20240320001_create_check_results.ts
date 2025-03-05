import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema
    .dropTableIfExists("check_results")
    .createTable("check_results", (table) => {
      table.string("id").primary();
      table.string("name").notNullable();
      table.string("check_id").notNullable();
      table.boolean("has_failures").notNullable();
      table.boolean("has_errors").notNullable();
      table.boolean("is_degraded").notNullable();
      table.boolean("over_max_response_time").notNullable();
      table.string("run_location").notNullable();
      table.timestamp("started_at").notNullable();
      table.timestamp("stopped_at").notNullable();
      table.timestamp("created_at").notNullable();
      table.integer("response_time");
      table.jsonb("api_check_result");
      table.jsonb("browser_check_result");
      table.jsonb("multi_step_check_result");
      table.bigint("check_run_id").notNullable();
      table.integer("attempts").notNullable();
      table.string("result_type").notNullable();
      table.string("sequence_id").notNullable();

      // Indexes
      table.index("check_id");
      table.index("created_at");
    });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable("check_results");
}
