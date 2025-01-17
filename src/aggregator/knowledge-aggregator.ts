import fs from "fs";
import path from "path";
import matter from "gray-matter";

import { DynamicKnowledge } from "@prisma/client";
import { prisma } from "../prisma";
import { WebhookAlertDto } from "../checkly/alertDTO";
import { CheckContext, ContextKey } from "./ContextAggregator";

const transformDocument = (fileContent: string, checkId: string): CheckContext => {
  const { data } = matter(fileContent);

  return {
    checkId,
    value: fileContent,
    source: 'knowledge',
    key: ContextKey.Knowledge.replace(
      "$documentSlug",
      data.slug
    ),
    analysis: data.summary,
  } as CheckContext;
}

const loadKnowledgeDocuments = async (directory: string): Promise<string[]> => {
  const collectMarkdownFiles = (dir: string): string[] => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Recursively collect files from subdirectories
        files.push(...collectMarkdownFiles(fullPath));
      } else if (entry.isFile() && fullPath.endsWith(".md")) {
        // Add Markdown files
        files.push(fullPath);
      }
    }

    return files;
  };

  const markdownFiles = collectMarkdownFiles(directory);

  return markdownFiles.map((filePath) => fs.readFileSync(filePath, "utf-8"));
};

const loadDynamicKnowledge = async (): Promise<string[]> => {
  const documents = await prisma.dynamicKnowledge.findMany({}) as DynamicKnowledge[]

  return documents.map((doc) => doc.content);
};


export const knowledgeAggregator = {
  name: "Knowledge",
  fetchContext: async (alert: WebhookAlertDto): Promise<CheckContext[]> => {
    console.log('Aggregating Knowledge Context...');
    const documents = [...await loadKnowledgeDocuments("./data/knowledge"), ...await loadDynamicKnowledge()];

    return documents.map((doc) => transformDocument(doc, alert.CHECK_ID));
  },
}
