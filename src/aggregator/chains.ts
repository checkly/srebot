import { generateText } from "ai";
import { openai } from "../ai/openai";
import { CheckContext } from "src/aggregator/ContextAggregator";
import { stringify } from "yaml";

export const generateContextAnalysis = async (context: CheckContext[]) => {
	const checkContext = stringify(
		context.find((c) => c.key === "checkly.check")
	);

	const generateContextAnalysis = async (text: string) => {
		const basePrompt = `The following check has failed: ${checkContext}
		
		Analyze the following context and generate a dense summary of the current situation: `;

		const summary = await generateText({
			model: openai("gpt-4o"),
			prompt: basePrompt + text,
			maxTokens: 300,
		});

		return summary.text;
	};

	const contextAnalysis = await Promise.all(
		context.map(async (c) => {
			const analysis = await generateContextAnalysis(stringify(c));
			return { ...c, analysis };
		})
	);

	return contextAnalysis;
};
