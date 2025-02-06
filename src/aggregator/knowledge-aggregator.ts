import { WebhookAlertDto } from "../checkly/alertDTO";
import { CheckContext, ContextKey } from "./ContextAggregator";
import { getAllDocuments, KnowledgeDocument, } from "../knowledge-base/knowledgeBase";

const transformDocument = (document: KnowledgeDocument, checkId: string): CheckContext => {
  return {
    checkId,
    value: document.content,
    source: 'knowledge',
    key: ContextKey.Knowledge.replace(
      "$documentSlug",
      document.slug
    ),
    analysis: document.summary,
  } as CheckContext;
}

export const knowledgeAggregator = {
  name: "Knowledge",
  fetchContext: async (alert: WebhookAlertDto): Promise<CheckContext[]> => {
    console.log('Aggregating Knowledge Context...');
    const documents = await getAllDocuments()

    return documents.map((doc) => transformDocument(doc, alert.CHECK_ID));
  },
}
