import { Client } from "@notionhq/client";
import "dotenv/config";

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });

interface NotionPage {
  slug: string;
  title: string;
  summary: string;
  content: string;
}

// Fetch Notion database pages
const fetchDatabasePages = async (databaseId: string): Promise<NotionPage[]> => {
  try {
    const response = await notion.databases.query({ database_id: databaseId });

    // Process each page and fetch content as Markdown
    const pages = await Promise.all(
      response.results.map(async (page: any) => {
        const title = page.properties?.Title?.title?.[0]?.text?.content || "Untitled";
        const slug = page.properties?.slug?.rich_text?.[0]?.plain_text || "untitled";
        const summary = page.properties?.summary?.rich_text?.[0]?.plain_text || "No summary";
        const content = await fetchPageContentAsMarkdown(page.id);

        return { title, slug, summary, content };
      })
    );

    return pages;
  } catch (error) {
    console.error("Error fetching database pages:", error);
    return [];
  }
};

// Fetch full page content and convert to Markdown
const fetchPageContentAsMarkdown = async (pageId: string, depth: number = 0): Promise<string> => {
  try {
    const response = await notion.blocks.children.list({ block_id: pageId });

    // Convert blocks to Markdown (handling nested lists)
    const strings = await Promise.all(response.results.map((block: any) => blockToMarkdown(block, depth)))
    return strings
      .filter(Boolean)
      .join("\n\n");
  } catch (error) {
    console.error(`Error fetching content for page ${pageId}:`, error);
    return "";
  }
};

// Convert Notion blocks to Markdown (handles indentation for nested lists)
const blockToMarkdown = async (block: any, depth: number = 0): Promise<string> => {
  const indent = "  ".repeat(depth); // 2 spaces per level for proper indentation

  if (block.type === "paragraph") {
    return indent + block.paragraph.rich_text.map((t: any) => t.text.content).join(" ");
  }
  if (block.type === "heading_1") {
    return `# ${block.heading_1.rich_text.map((t: any) => t.text.content).join(" ")}`;
  }
  if (block.type === "heading_2") {
    return `## ${block.heading_2.rich_text.map((t: any) => t.text.content).join(" ")}`;
  }
  if (block.type === "heading_3") {
    return `### ${block.heading_3.rich_text.map((t: any) => t.text.content).join(" ")}`;
  }
  if (block.type === "bulleted_list_item") {
    let text = `- ${block.bulleted_list_item.rich_text.map((t: any) => t.text.content).join(" ")}`;
    if (block.has_children) {
      const nestedContent = await fetchPageContentAsMarkdown(block.id, depth + 1);
      return `${indent}${text}\n${nestedContent}`;
    }
    return indent + text;
  }
  if (block.type === "numbered_list_item") {
    let text = `1. ${block.numbered_list_item.rich_text.map((t: any) => t.text.content).join(" ")}`;
    if (block.has_children) {
      const nestedContent = await fetchPageContentAsMarkdown(block.id, depth + 1);
      return `${indent}${text}\n${nestedContent}`;
    }
    return indent + text;
  }
  if (block.type === "quote") {
    return indent + `> ${block.quote.rich_text.map((t: any) => t.text.content).join(" ")}`;
  }
  if (block.type === "code") {
    const language = block.code.language || "plaintext";
    const code = block.code.rich_text.map((t: any) => t.text.content).join("\n");
    return `\`\`\`${language}\n${code}\n\`\`\``;
  }
  if (block.type === "to_do") {
    const checked = block.to_do.checked ? "☑" : "☐";
    return indent + `${checked} ${block.to_do.rich_text.map((t: any) => t.text.content).join(" ")}`;
  }
  if (block.type === "divider") {
    return indent + `---`;
  }
  if (block.type === "image") {
    return indent + `![Image](${block.image.file?.url || block.image.external?.url})`;
  }
  if (block.type === "embed") {
    return indent + `[Embedded Content](${block.embed.url})`;
  }
  return "";
};

// Example usage
const DATABASE_ID = process.env.NOTION_DATABASE_ID as string;

export const fetchDocumentsFromKnowledgeBase = async (databaseId = DATABASE_ID) => {
  return fetchDatabasePages(databaseId);
}
