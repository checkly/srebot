import { Knex } from "knex";

export const up = async (knex: Knex): Promise<void> => {
  await knex.schema.createTable("learnings", (table) => {
    table.string("id").primary(); // short string identifier
    table.string("source"); // short string for source
    table.string("sourceId"); // short string for source ID, this can notion page title
    table.text("content"); // long text column for content
    table.timestamp("fetchedAt"); // Date/timestamp column
    table.specificType("embedding", "vector(1536)").notNullable(); // custom vector type
    table.string("embedding_model").notNullable(); // string column for the embedding model

    table.unique(["source", "sourceId"]);
  });
};

export const down = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists("learnings");
};
