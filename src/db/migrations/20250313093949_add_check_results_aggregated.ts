/**
 * Migration for creating the check_results_aggregated table with retry-aware aggregation.
 *
 * This table aggregates check results per account, check, location, and time bucket.
 * It includes separate fields for final counts and attempt counts to account for retries.
 */

exports.up = (knex) =>
  knex.schema.createTable("check_results_aggregated", (table) => {
    table.uuid("accountId").notNullable();
    table.uuid("checkId").notNullable();
    table.string("location").notNullable();
    table.timestamp("startedAtBucket").notNullable();

    // Final aggregated counts after all retries
    table.integer("passingFinal").notNullable().defaultTo(0);
    table.integer("failingFinal").notNullable().defaultTo(0);
    table.integer("degradedFinal").notNullable().defaultTo(0);
    table.integer("allFinal").notNullable().defaultTo(0);

    // Attempt counts from individual tries (before final resolution)
    table.integer("failingAttempt").notNullable().defaultTo(0);
    table.integer("degradedAttempt").notNullable().defaultTo(0);
    table.integer("allAttempt").notNullable().defaultTo(0);

    // Composite primary key ensures uniqueness per account, check, and time bucket.
    table.primary(["checkId", "startedAtBucket", "location"]);
  });

exports.down = (knex) => knex.schema.dropTable("check_results_aggregated");
