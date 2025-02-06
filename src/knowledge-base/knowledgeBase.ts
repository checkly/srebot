import { fetchDocumentsFromKnowledgeBase } from "../notion/notion";

export type KnowledgeDocument = {
  content: string;
  title: string
  slug: string
  summary: string
}

export const getAllDocuments = async (): Promise<KnowledgeDocument[]> => {
  return fetchDocumentsFromKnowledgeBase()
}
