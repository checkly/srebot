import { z } from "zod";
import { Tool, createToolParameters, createToolOutput } from "../../ai/Tool";
import { prisma } from "../../prisma";
import { SreAssistant } from "../SreAssistant";
import { generateObject, generateText } from "ai";
import { getOpenaiSDKClient } from "../../ai/openai";
import { ContextKey } from "../../aggregator/ContextAggregator";

const parameters = createToolParameters(
	z.object({
		query: z
			.string()
			.describe(
				"A concise and specific search query or request for information in natural language."
			),
		contextKey: z
			.enum(Object.values(ContextKey) as [string, ...string[]])
			.optional()
			.describe("A specific context key to filter the search results."),
	})
);

const outputSchema = createToolOutput(
	z.array(
		z.object({
			relevance: z.number(),
			context: z.string(),
		})
	)
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
			", "
		)}`;
		this.parameters = createToolParameters(
			z.object({
				query: z.string().describe("The query to search for in the context"),
				contextKey: z
					.enum(contextKeys.map((c) => c) as [string, ...string[]])
					.optional()
					.describe("The context key to search in."),
			})
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

		const relevantContext = await generateObject({
			output: "array",
			schema: z.object({
				relevance: z.number(),
				context: z.string(),
			}),
			model: getOpenaiSDKClient()("gpt-4o"),
			prompt: `You are an AI assistant tasked with searching through a given context based on a user's query. Your goal is to find and return the most relevant information from the context that relates to the query.

Here is the context you will be searching through:
<context>
${contextData.map((c) => c.key + ": " + JSON.stringify(c.value)).join("\n")}
</context>

The user's query is:
<query>${input.query}</query>

To complete this task, follow these steps:

1. Carefully read and analyze both the context and the query.
2. Identify key words, phrases, or concepts in the query that you should look for in the context.
3. Search through the context to find sections that are most relevant to the query. Consider both exact matches and semantically similar information.
4. Determine the relevance of each potential match by considering:
   - How closely it relates to the query
   - How completely it answers the query (if applicable)
   - The importance of the information in the context of the query
5. Select the most relevant section(s) of the context. If multiple sections are equally relevant, you may include more than one.

Remember:
- Stay focused on the query and only return information that is directly relevant.
- Do not add any information that is not present in the given context.
- If the query asks a specific question, prioritize information that directly answers that question.
- Be concise in your explanations, but make sure they clearly justify the relevance of the selected text.`,
			maxTokens: 1000,
		});

		return relevantContext.object
			.sort((a, b) => b.relevance - a.relevance)
			.slice(0, 30);
	}
}
