import { generateText } from "ai";
import { getOpenaiSDKClient } from "../ai/openai";
import { CheckContext } from "../aggregator/ContextAggregator";
import { stringify } from "yaml";
import { ContextKey } from "./ContextAggregator";

export const generateContextAnalysis = async (context: CheckContext[]) => {
	const checkContext = stringify(
		context.find((c) => c.key === "checkly.check")
	);

	const generateContextAnalysis = async (text: string) => {
		const basePrompt = `The following check has failed: ${checkContext}
		
		Analyze the following context and generate a dense summary of the current situation: `;

		const summary = await generateText({
			model: getOpenaiSDKClient()("gpt-4o"),
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

export const generateContextAnalysisSummary = async (
	contextAnalysis: (CheckContext & { analysis: string })[]
) => {
	const summary = await generateText({
		model: getOpenaiSDKClient()("gpt-4o"),
		prompt: `The following check has failed: ${stringify(
			contextAnalysis.find((c) => c.key === ContextKey.ChecklyCheck)
		)}\n\nAnaylze the following context and generate a dense summary of the current situation: ${contextAnalysis
			.map((c) => c.analysis)
			.join("\n\n")}`,
		maxTokens: 300,
	});

	return summary.text;
};
