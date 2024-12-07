import { generateText } from "ai";
import { getOpenaiSDKClient } from "../ai/openai";
import { CheckContext } from "../aggregator/ContextAggregator";
import { stringify } from "yaml";
import { ContextKey } from "./ContextAggregator";
import { slackFormatInstructions } from "../slackbot/utils";

export const generateContextAnalysis = async (context: CheckContext[]) => {
	const checkContext = stringify(
		context.find((c) => c.key === "checkly.check")
	);

	const generateContextAnalysis = async (text: string) => {
		const prompt = `The following check has failed: ${checkContext}
		
		Analyze the following context and generate a concise summary to extract the most important context. Output only the relevant context summary, no other text.

CONTEXT:
${text}
`;

		const summary = await generateText({
			model: getOpenaiSDKClient()("gpt-4o"),
			prompt: prompt,
			temperature: 0.1,
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
		)}
	
Anaylze the following context and generate a concise summary of the current situation.

CONSTITUTION:
- Always prioritize accuracy and relevance in your insights and recommendations
- Be concise but comprehensive in your explanations
- Focus on providing actionable information that can help reduce MTTR
- The user is a experienced devops engineer. Don't overcomplicate it, focus on the context and provide actionable insights. They know what they are doing, don't worry about the details.
- Don't include the check configuration or run details, focus on logs, changes and the current state of the system.

OUTPUT FORMAT INSTRUCTIONS:
${slackFormatInstructions}

CONTEXT:
${contextAnalysis
	.filter((c) => c.key !== ContextKey.ChecklyCheck)
	.map((c) => `${c.key}: ${c.analysis}`)
	.join("\n\n")}

Check-results amd checkly configuration details are already provided in the UI. Focus on the root cause analyisis and potential mitigations. Help the user to resolve the issue.
Generate a condensed breakdown of the current situation. Focus on the essentials and provide a concise overview. Max. 100 words. Include links to relevant context if applicable.`,
		maxTokens: 200,
	});

	return summary.text;
};
