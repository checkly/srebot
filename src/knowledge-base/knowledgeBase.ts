import { findLearningsBySource, LearningSource } from "../db/learnings";

export type KnowledgeDocument = {
  content: string;
  title: string;
  slug: string;
  summary: string;
};

export const getAllDocuments = async (): Promise<KnowledgeDocument[]> => {
  const learningsInDb = await findLearningsBySource(LearningSource.NOTION);

  return learningsInDb.map((learning) => ({
    content: learning.content,
    slug: learning.id,
    summary: "", // TODO we should replace this with a vector search
    title: learning.sourceId,
  }));
};

export const getDocumentBySlug = async (
  slug: string,
): Promise<KnowledgeDocument | null> => {
  const documents = await getAllDocuments();
  return documents.find((doc) => doc.slug === slug) || null;
};
