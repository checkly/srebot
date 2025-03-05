import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("error_clusters", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name").notNullable();
    table.text("error_pattern").notNullable();
    table.jsonb("metadata").defaultTo("{}");
    table.integer("occurrence_count").notNullable().defaultTo(0);
    table.timestamp("first_seen").notNullable();
    table.timestamp("last_seen").notNullable();
    table.specificType("embedding", "vector(1536)").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });

  // Create IVFFlat index for vector similarity search
  await knex.raw(
    `CREATE INDEX error_clusters_embedding_idx ON error_clusters USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`,
  );

  // Create join table for cluster members
  await knex.schema.createTable("error_cluster_members", (table) => {
    table
      .uuid("cluster_id")
      .references("id")
      .inTable("error_clusters")
      .onDelete("CASCADE");
    table
      .string("check_result_id")
      .references("id")
      .inTable("check_results")
      .onDelete("CASCADE");
    table.float("similarity").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    // Composite primary key
    table.primary(["cluster_id", "check_result_id"]);

    // Indexes
    table.index("cluster_id");
    table.index("check_result_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("error_cluster_members");
  await knex.schema.dropTable("error_clusters");
}
