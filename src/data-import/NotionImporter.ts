import { fetchDocumentsFromKnowledgeBase, NotionPage } from "../notion/notion";
import {
  deleteLearningsBySource,
  findLearningsBySource,
  LearningSource,
  LearningsTable,
  upsertLearnings,
} from "../db/learnings";
import { keyBy, uniqBy, zipObject } from "lodash";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { log } from "../log";

export class NotionImporter {
  private readonly embeddingModel: string;

  constructor() {
    this.embeddingModel = "text-embedding-3-small";
  }

  /**
   * Imports documents from Notion to the database
   * Generates embeddings for the content and stores them in the database
   */
  async importNotion() {
    const startedAt = Date.now();

    const [currentDbLearnings, apiDocuments] = await Promise.all([
      findLearningsBySource(LearningSource.NOTION),
      fetchDocumentsFromKnowledgeBase(),
    ]);

    const apiDocumentsWithoutDuplicates = uniqBy(apiDocuments, "slug");
    if (apiDocumentsWithoutDuplicates.length !== apiDocuments.length) {
      // TODO handle this better
      log.warn(
        {
          duplicatesCount:
            apiDocuments.length - apiDocumentsWithoutDuplicates.length,
        },
        "Duplicate slug documents found",
      );
    }

    const dbLearningsById: Record<string, LearningsTable> = keyBy(
      currentDbLearnings,
      "id",
    );

    const documentsWithChangedContent = apiDocumentsWithoutDuplicates.filter(
      (notionApiDocument) => {
        const dbDocument = dbLearningsById[notionApiDocument.slug];
        if (!dbDocument) {
          return true;
        }
        if (dbDocument.content !== notionApiDocument.content) {
          return true;
        }
        return dbDocument.sourceId !== notionApiDocument.title;
      },
    );

    if (documentsWithChangedContent.length > 0) {
      const documentsForUpsert = await this.prepareDocumentsForInsert(
        documentsWithChangedContent,
      );
      await upsertLearnings(documentsForUpsert);
    }

    const idsOfDocumentsToKeep = apiDocumentsWithoutDuplicates.map(
      (document) => document.slug,
    );
    await deleteLearningsBySource(LearningSource.NOTION, idsOfDocumentsToKeep);

    log.info(
      {
        durationMs: Date.now() - startedAt,
        newDocuments: documentsWithChangedContent.length,
        totalDocuments: apiDocumentsWithoutDuplicates.length,
      },
      "Imported Notion documents successfully",
    );
  }

  private async prepareDocumentsForInsert(documentsToInsert: NotionPage[]) {
    // TODO we might need to chunk this
    const contentsToEmbed = documentsToInsert.map(
      (document) => document.content,
    );

    const { embeddings } = await embedMany({
      model: openai.embedding(this.embeddingModel),
      values: contentsToEmbed,
    });

    const documentIds = documentsToInsert.map((document) => document.slug);
    const embeddingByDocumentId = zipObject(documentIds, embeddings);

    const documentsForUpsert: LearningsTable[] = documentsToInsert.map(
      (document) => {
        return {
          id: document.slug,
          source: LearningSource.NOTION,
          sourceId: document.title,
          content: document.content,
          fetchedAt: new Date(),
          embedding: embeddingByDocumentId[document.slug],
          embedding_model: this.embeddingModel,
        };
      },
    );

    return documentsForUpsert;
  }
}
