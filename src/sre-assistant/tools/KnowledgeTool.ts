import { z } from "zod";
import { createToolOutput, createToolParameters, Tool } from "../../ai/Tool";
import { SreAssistant } from "../SreAssistant";
import { getAllDocuments } from "../../knowledge-base/knowledgeBase";

const parameters = createToolParameters(
  z.object({
    action: z
      .enum([
        "listDocuments",
        "getOneDocument",
      ])
      .describe("The action to perform on the Knowledge Base"),
    documentSlug: z
      .string()
      .describe(
        "The slug of the Document to get information about. Omit this field for the 'listDocuments' action. Required for the 'getOneDocument'"
      )
      .optional(),
  })
);

const outputSchema = createToolOutput(
  z.string().describe("The response from the Knowledge Base")
);

export class KnowledgeTool extends Tool<
  typeof parameters,
  typeof outputSchema,
  SreAssistant
> {
  static parameters = parameters;
  static outputSchema = outputSchema;

  constructor(agent: SreAssistant) {
    super({
      name: "KnowledgeBase",
      description:
        "Interact with the Knowledge Base to retrieve relevant context about the organisation structure, projects and terminology.",
      parameters,
      agent,
    });
  }

  async execute(input: z.infer<typeof parameters>) {
    if (input.action === "listDocuments") {
      const documents = await getAllDocuments();

      return JSON.stringify(documents.map((doc) => ({
        slug: doc.slug,
        title: doc.title,
        summary: doc.summary,
      })));
    } else if (input.action === "getOneDocument") {
      if (!input.documentSlug) {
        return "Document slug is required";
      }

      const document = await getAllDocuments().then(docs => docs.find(doc => doc.slug === input.documentSlug));

      if (!document) {
        return `Document for slug: ${input.documentSlug} not found`;
      }

      return JSON.stringify(document);
    }

    return "Invalid action";
  }
}
