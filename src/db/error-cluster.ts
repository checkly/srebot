import postgres from "./postgres";
import pgvector from "pgvector/knex";

export interface ErrorClusterTable {
  account_id: string;
  id: string;
  error_message: string;
  first_seen_at: Date;
  last_seen_at: Date;
  embedding: number[];
  embedding_model: string;
}

export interface ErrorClusterMemberTable {
  error_id: string;
  result_check_id: string;
  check_id: string;
  date: Date;
  embedding: number[];
  embedding_model: string;
}

export async function insertErrorCluster(
  cluster: ErrorClusterTable,
): Promise<void> {
  await postgres("error_cluster").insert({
    id: cluster.id,
    account_id: cluster.account_id,
    error_message: cluster.error_message,
    first_seen_at: cluster.first_seen_at,
    last_seen_at: cluster.last_seen_at,
    embedding: pgvector.toSql(cluster.embedding),
    embedding_model: cluster.embedding_model,
  });
}

export async function findMatchingErrorCluster(
  accountId: string,
  embedding: number[],
): Promise<ErrorClusterTable | null> {
  const clusters = await postgres<ErrorClusterTable>("error_cluster")
    .select("*")
    .select(
      postgres.raw("embedding <=> ?::vector as distance", [
        pgvector.toSql(embedding),
      ]),
    )
    .where("account_id", accountId)
    .orderBy("distance")
    .limit(1);

  return clusters[0]?.distance <= 0.05 ? clusters[0] : null;
}

export type ErrorClusterWithCount = ErrorClusterTable & {
  count: number;
};

export async function findErrorClusters(
  errorIds: string | string[],
  interval?: { from: Date; to: Date },
): Promise<ErrorClusterWithCount[]> {
  return postgres<ErrorClusterWithCount>("error_cluster")
    .select("error_cluster.*")
    .count("error_cluster_membership.check_id as count")
    .whereIn(
      "error_cluster.id",
      Array.isArray(errorIds) ? errorIds : [errorIds],
    )
    .modify((queryBuilder) => {
      if (interval) {
        queryBuilder.andWhereBetween("error_cluster_membership.date", [
          interval.from,
          interval.to,
        ]);
      }
    })
    .join(
      "error_cluster_membership",
      "error_cluster.id",
      "error_cluster_membership.error_id",
    )
    .orderBy("count", "desc")
    .groupBy("error_cluster.id");
}

export async function findErrorClustersForChecks(
  checkIds: string | string[],
  options: {
    interval?: { from: Date; to: Date };
    resultType?: "FINAL" | "ATTEMPT";
  } = {},
): Promise<ErrorClusterWithCount[]> {
  const results = await postgres<ErrorClusterWithCount>("error_cluster")
    .select("error_cluster.*")
    .count("error_cluster_membership.check_id as count")
    .join(
      "error_cluster_membership",
      "error_cluster.id",
      "error_cluster_membership.error_id",
    )
    .whereIn(
      "error_cluster_membership.check_id",
      Array.isArray(checkIds) ? checkIds : [checkIds],
    )
    .modify((queryBuilder) => {
      if (options.interval) {
        queryBuilder.andWhereBetween("error_cluster_membership.date", [
          options.interval.from,
          options.interval.to,
        ]);
      }
      if (options.resultType) {
        queryBuilder.join(
          "check_results",
          "check_results.id",
          "error_cluster_membership.result_check_id",
        );
        queryBuilder.andWhere("check_results.resultType", options.resultType);
      }
    })
    .groupBy("error_cluster.id");

  // We have to manually parse count because knex is stupid
  return results.map((row) => ({
    ...row,
    count: Number(row.count),
  }));
}

export async function getOldestMembershipDatesForErrors(
  checkId: string,
  errorIds: string[],
): Promise<Pick<ErrorClusterMemberTable, "date" | "error_id">[]> {
  return postgres<ErrorClusterMemberTable>("error_cluster_membership")
    .select("error_id", "date")
    .where("check_id", checkId)
    .whereIn("error_id", errorIds)
    .orderBy(["error_id", { column: "date", order: "asc" }])
    .distinctOn("error_id");
}

export async function insertErrorClusterMember(
  member: ErrorClusterMemberTable,
): Promise<void> {
  await postgres<ErrorClusterMemberTable>("error_cluster_membership")
    .insert(member)
    .onConflict(["error_id", "result_check_id"])
    .ignore();

  await postgres("error_cluster").where({ id: member.error_id }).update({
    last_seen_at: member.date,
  });
}
