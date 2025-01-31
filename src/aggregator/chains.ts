import { generateText } from "ai";
import { getOpenaiSDKClient } from "../ai/openai";
import { CheckContext, ContextKey } from "./ContextAggregator";
import { stringify } from "yaml";
import { slackFormatInstructions } from "../slackbot/utils";

const getCheckContext = (context: CheckContext[]) => {
  const checkContext = context.find((c) => c.key === ContextKey.ChecklyCheck);
  return stringify(
    {
      checkId: checkContext?.checkId,
      data: checkContext?.value,
    },
    { indent: 2 }
  );
};

export const generateContextAnalysis = async (context: CheckContext[]) => {
  const checkContext = getCheckContext(context);

  const generateContextAnalysis = async (text: string) => {
    const prompt = `The following check has failed: ${checkContext}

		Analyze the following context and generate a concise summary to extract the most important information. Output only the relevant context summary, no other text.

CONTEXT:
${text}`;

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
  contextAnalysis: CheckContext[]
) => {
  const checkContext = getCheckContext(contextAnalysis);
  const summary = await generateText({
    model: getOpenaiSDKClient()("gpt-4o"),
    temperature: 1,
    prompt: `The following check has changed its state: ${checkContext}

Anaylze the following context and generate a concise summary of the current situation.

CONSTITUTION:
- Always prioritize accuracy and relevance in your insights and recommendations
- Be concise but comprehensive in your explanations
- Focus on providing actionable information that can help reduce MTTR
- The user is a experienced devops engineer. Don't overcomplicate it, focus on the context and provide actionable insights. They know what they are doing, don't worry about the details.
- Don't include the check configuration or run details, focus on logs, changes and the current state of the system.
- Knowledge context is provided for you to build better understanding of the product, system and organisation structures.


OUTPUT FORMAT INSTRUCTIONS:
${slackFormatInstructions}

CONTEXT:
${stringify(
      contextAnalysis
        .filter((c) => c.key !== ContextKey.ChecklyCheck)
        .map((c) => ({ key: c.key, source: c.source, value: c.value })),
      { indent: 2 }
    ).slice(0, 200000)}

Check-results amd checkly configuration details are already provided in the UI. Focus on the root cause analysis and potential mitigations. Help the user to resolve the issue.
Generate a condensed summary of your root cause analysis of the current situation.
Focus on the essentials, provide a concise overview and actionable insights.
Provide reasoning and the source of the information. Max. 100 words. Include links to relevant context if applicable.
Be concise, insightful and actionable, skip the fluff, no yapping.
If a recent release is the most likely root cause, provide a link to the release diff.

*Summary:* `,
    maxTokens: 500,
  });

  return summary.text;
};
