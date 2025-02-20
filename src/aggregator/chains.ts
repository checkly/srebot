import { generateText } from "ai";
import {
  contextAnalysisEntryPrompt,
  contextAnalysisSummaryPrompt,
} from "../prompts/checkly";
import { CheckContext } from "./ContextAggregator";

export const generateContextAnalysis = async (context: CheckContext[]) => {
  return await Promise.all(
    context.map(async (c) => {
      const analysis = await generateContextAnalysisForEntry(c);
      return { ...c, analysis };
    }),
  );

  async function generateContextAnalysisForEntry(entry: CheckContext) {
    const summary = await generateText(
      contextAnalysisEntryPrompt(entry, context),
    );

    return summary.text;
  }
};

export const generateContextAnalysisSummary = async (
  contextAnalysis: CheckContext[],
) => {
  const summary = await generateText(
    contextAnalysisSummaryPrompt(contextAnalysis),
  );

  return summary.text;
};
