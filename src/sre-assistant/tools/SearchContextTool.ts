import { z } from "zod";
import { Tool, createToolParameters, createToolOutput } from "../../ai/Tool";
import { prisma } from "../../prisma";
import { SreAssistant } from "../SreAssistant";
import { generateObject, generateText } from "ai";
import { getOpenaiSDKClient } from "../../ai/openai";

const parameters = createToolParameters(
	z.object({
		query: z.string().describe("The query to search for in the context"),
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

	constructor(agent: SreAssistant) {
		super({
			name: "SearchContextTool",
			description:
				"Search for relevant context based on the given query. Extract the most relevant information from the context that relates to the query.",
			parameters,
			agent,
		});
	}

	async execute(input: z.infer<typeof parameters>) {
		const alertData = await prisma.alert.findUniqueOrThrow({
			where: {
				id: this.agent.alertId,
			},
			select: {
				context: true,
			},
		});

		if (!alertData.context) {
			throw new Error("Alert not found");
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
${alertData.context}
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
