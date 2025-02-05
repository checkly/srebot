import { generateText } from "ai";
import { getOpenaiSDKClient } from "../ai/openai";
import { CheckContext, ContextKey } from "./ContextAggregator";
import {
  contextAnalysisEntryPrompt,
  contextAnalysisSummaryPrompt,
} from "src/prompts/checkly";

export const generateContextAnalysis = async (context: CheckContext[]) => {
  return await Promise.all(
    context.map(async (c) => {
      const analysis = await generateContextAnalysisForEntry(c);
      return { ...c, analysis };
    }),
  );

  async function generateContextAnalysisForEntry(entry: CheckContext) {
    const summary = await generateText({
      model: getOpenaiSDKClient()("gpt-4o"),
      prompt: contextAnalysisEntryPrompt(entry, context),
      temperature: 0.1,
      maxTokens: 300,
    });

    return summary.text;
  }
};

export const generateContextAnalysisSummary = async (
  contextAnalysis: CheckContext[],
) => {
  const summary = await generateText({
    model: getOpenaiSDKClient()("gpt-4o"),
    temperature: 1,
    prompt: contextAnalysisSummaryPrompt(contextAnalysis),
    maxTokens: 500,
  });

  return summary.text;
};
