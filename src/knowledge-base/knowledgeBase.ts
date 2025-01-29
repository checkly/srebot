import fs from "fs";
import path from "path";
import matter from "gray-matter";

import { DynamicKnowledge } from "@prisma/client";
import { prisma } from "../prisma";

// This path assumes that the working directory is the root directory of the project
const STATIC_KNOWLEDGE_DIRECTORY = "./data/knowledge";

export type KnowledgeDocument = {
  content: string;
  fullContent: string;
  title: string
  slug: string
  summary: string
  created: Date
  updated: Date
}

const parseDocument = (rawDocument: string): KnowledgeDocument => {
  const parsed = matter(rawDocument);

  return {
    slug: parsed.data.slug,
    summary: parsed.data.summary,
    created: new Date(parsed.data.created),
    updated: new Date(parsed.data.updated),
    fullContent: rawDocument,
    content: parsed.content,
    title: parsed.data.title
  }
}

export const loadKnowledgeDocuments = async (directory: string = STATIC_KNOWLEDGE_DIRECTORY): Promise<KnowledgeDocument[]> => {
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

  return markdownFiles.map((filePath) => parseDocument(fs.readFileSync(filePath, "utf-8")));
};

export const loadDynamicKnowledge = async (): Promise<KnowledgeDocument[]> => {
  const documents = await prisma.dynamicKnowledge.findMany({}) as DynamicKnowledge[]

  return documents.map((doc) => parseDocument(doc.content));
};

export const getAllDocuments = async (): Promise<KnowledgeDocument[]> => {
  const staticKnowledge = await loadKnowledgeDocuments();
  const dynamicKnowledge = await loadDynamicKnowledge();

  return [...staticKnowledge, ...dynamicKnowledge];
}
