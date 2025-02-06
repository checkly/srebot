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
    const [prompt, config] = contextAnalysisEntryPrompt(entry, context);

    const summary = await generateText({
      ...config,
      prompt,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "generateContextAnalysis",
      },
    });

    return summary.text;
  }
};

export const generateContextAnalysisSummary = async (
  contextAnalysis: CheckContext[],
) => {
  const [prompt, config] = contextAnalysisSummaryPrompt(contextAnalysis);

  const summary = await generateText({
    ...config,
    prompt,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "generateContextAnalysisSummary",
    },
  });

  return summary.text;
};
