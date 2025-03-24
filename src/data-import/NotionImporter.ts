import { fetchDocumentsFromKnowledgeBase, NotionPage } from "../notion/notion";
import {
  deleteLearnings,
  findAllLearnings,
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
      findAllLearnings({ source: LearningSource.NOTION }),
      fetchDocumentsFromKnowledgeBase(),
    ]);

    const apiDocumentsWithoutDuplicates: NotionPage[] = uniqBy(
      apiDocuments,
      "slug",
    );
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

    const documentsWithChanges = this.findDocumentsWithChanges(
      apiDocumentsWithoutDuplicates,
      dbLearningsById,
    );

    if (documentsWithChanges.length > 0) {
      const documentsForUpsert =
        await this.prepareDocumentsForInsert(documentsWithChanges);
      await upsertLearnings(documentsForUpsert);
    }

    await this.removeMissingDocuments(
      apiDocumentsWithoutDuplicates,
      currentDbLearnings,
    );

    log.info(
      {
        durationMs: Date.now() - startedAt,
        newDocuments: documentsWithChanges.length,
        totalDocuments: apiDocumentsWithoutDuplicates.length,
      },
      "Imported Notion documents successfully",
    );
  }

  private findDocumentsWithChanges(
    apiDocumentsWithoutDuplicates: NotionPage[],
    dbLearningsById: Record<string, LearningsTable>,
  ): NotionPage[] {
    return apiDocumentsWithoutDuplicates.filter((notionApiDocument) => {
      const dbDocument = dbLearningsById[notionApiDocument.slug];
      if (!dbDocument) {
        return true;
      }
      // TODO we can improve this later by comparing hashes or direct queries in the DB
      if (dbDocument.content !== notionApiDocument.content) {
        return true;
      }
      return dbDocument.sourceId !== notionApiDocument.title;
    });
  }

  private async prepareDocumentsForInsert(
    documentsToInsert: NotionPage[],
  ): Promise<LearningsTable[]> {
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

    return documentsToInsert.map((document) => {
      return {
        id: document.slug,
        source: LearningSource.NOTION,
        sourceId: document.title,
        content: document.content,
        fetchedAt: new Date(),
        embedding: embeddingByDocumentId[document.slug],
        embedding_model: this.embeddingModel,
      };
    });
  }

  private async removeMissingDocuments(
    apiDocumentsWithoutDuplicates: NotionPage[],
    currentDbLearnings: LearningsTable[],
  ) {
    const apiDocumentsIds: Set<string> = new Set(
      apiDocumentsWithoutDuplicates.map((document) => document.slug),
    );

    const documentIdsToRemove = currentDbLearnings
      .map((document) => document.id)
      .filter((id) => !apiDocumentsIds.has(id));

    if (documentIdsToRemove.length > 0) {
      await deleteLearnings(documentIdsToRemove);
      log.info(
        { deletedCount: documentIdsToRemove.length },
        "Removed missing documents from the database",
      );
    }
  }
}
