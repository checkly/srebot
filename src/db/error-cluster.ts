import { log } from "../slackbot/log";
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

  log.info(
    {
      clusters: JSON.stringify(
        { clusters: clusters.map((c) => ({ ...c, embedding: "[hidden]" })) },
        null,
        2,
      ),
    },
    "Found matching error cluster",
  );

  return clusters[0]?.distance <= 0.05 ? clusters[0] : null;
}

export async function insertErrorClusterMember(
  member: ErrorClusterMemberTable,
): Promise<void> {
  await postgres<ErrorClusterMemberTable>("error_cluster_membership").insert(
    member,
  );

  await postgres("error_cluster").where({ id: member.error_id }).update({
    last_seen_at: member.date,
  });
}
