import { z } from "zod";
import { createToolOutput, createToolParameters, Tool } from "../../ai/Tool";
import { prisma } from "../../prisma";
import { SreAssistant } from "../SreAssistant";
import { generateObject } from "ai";
import { getOpenaiSDKClient } from "../../ai/openai";
import { ContextKey } from "../../aggregator/ContextAggregator";
import { searchContextPrompt } from "src/prompts/search";

const parameters = createToolParameters(
  z.object({
    query: z
      .string()
      .describe(
        "A concise and specific search query or request for information in natural language.",
      ),
    contextKey: z
      .enum(Object.values(ContextKey) as [string, ...string[]])
      .optional()
      .describe("A specific context key to filter the search results."),
  }),
);

const outputSchema = createToolOutput(
  z.array(
    z.object({
      relevance: z.number(),
      context: z.string(),
    }),
  ),
);

export class SearchContextTool extends Tool<
  typeof parameters,
  typeof outputSchema,
  SreAssistant
> {
  static parameters = parameters;
  static outputSchema = outputSchema;
  contextKeys: string[] = Object.values(ContextKey);

  constructor(agent: SreAssistant) {
    super({
      name: "SearchContextTool",
      description:
        "Search for relevant context based on the given query. Extract the most relevant information from the context that relates to the query.",
      parameters,
      agent,
    });
  }

  async init() {
    const alertId = this.agent.alertId;
    if (!alertId) {
      throw new Error("Alert ID not found");
    }

    const contextKeysData = await prisma.alert.findUniqueOrThrow({
      where: {
        id: alertId,
      },
      select: {
        context: {
          select: {
            key: true,
          },
        },
      },
    });

    if (!contextKeysData.context) {
      throw new Error("Alert not found");
    }

    const contextKeys = contextKeysData.context.map((c) => c.key);
    this.contextKeys = contextKeys;

    this.description = `Search for relevant context based on the given query. Extract the most relevant information from the context that relates to the query. Available context keys: ${contextKeys.join(
      ", ",
    )}`;
    this.parameters = createToolParameters(
      z.object({
        query: z.string().describe("The query to search for in the context"),
        contextKey: z
          .enum(contextKeys.map((c) => c) as [string, ...string[]])
          .optional()
          .describe("The context key to search in."),
      }),
    );
  }

  async execute(input: z.infer<typeof parameters>) {
    const contextData = await prisma.alertContext.findMany({
      where: {
        key: {
          in: this.contextKeys,
        },
        alertId: this.agent.alertId,
      },
      select: {
        key: true,
        value: true,
      },
    });

    if (!contextData.length) {
      throw new Error("No context data found");
    }

    const [prompt, config] = searchContextPrompt(input.query, contextData);

    const relevantContext = await generateObject({
      output: "array",
      schema: z.object({
        relevance: z.number(),
        context: z.string(),
      }),
      ...config,
      prompt,
    });

    return relevantContext.object
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 30);
  }
}
