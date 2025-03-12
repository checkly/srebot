exports.up = async function (knex) {
  await knex.schema.alterTable("error_cluster_membership", (table) => {
    table.dropForeign("error_id");
    table.dropForeign("result_check_id");
    table.dropForeign("check_id");
  });
};

exports.down = async function (knex) {
  // do nothing
};
