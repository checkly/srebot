import postgres from "./postgres";
import pgvector from "pgvector/knex";

export interface LearningsTable {
  id: string;
  source: LearningSource;
  sourceId: string;
  content: string;
  fetchedAt: Date;
  embedding: number[]; // represents a vector of 1536 numbers
  embedding_model: string;
}

export enum LearningSource {
  NOTION = "NOTION",
}

export async function upsertLearnings(
  learnings: LearningsTable[],
): Promise<void> {
  await postgres("learnings")
    .insert(
      learnings.map((learning) => ({
        ...learning,
        embedding: pgvector.toSql(learning.embedding),
      })),
    )
    .onConflict("id")
    .merge();
}

export async function findAllLearnings(options?: {
  source: LearningSource;
}): Promise<LearningsTable[]> {
  const queryBuilder = postgres<LearningsTable>("learnings").select("*");

  if (options?.source) {
    queryBuilder.where("source", options.source);
  }

  return queryBuilder;
}

export async function deleteLearnings(
  idsToRemove: string[],
): Promise<LearningsTable[]> {
  return postgres<LearningsTable>("learnings").whereIn("id", idsToRemove).del();
}
