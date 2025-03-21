import { fetchDocumentsFromKnowledgeBase } from "../notion/notion";

export type KnowledgeDocument = {
  content: string;
  title: string;
  slug: string;
  summary: string;
};

export const getAllDocuments = async (): Promise<KnowledgeDocument[]> => {
  return fetchDocumentsFromKnowledgeBase();
};

export const getDocumentBySlug = async (
  slug: string,
): Promise<KnowledgeDocument | null> => {
  const documents = await getAllDocuments();
  return documents.find((doc) => doc.slug === slug) || null;
};
