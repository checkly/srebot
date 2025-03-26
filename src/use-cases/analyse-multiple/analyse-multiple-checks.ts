import { findTargetChecks } from "./find-target-checks";
import { generateText } from "ai";
import { summariseMultipleChecksGoal } from "../../prompts/summarizeCheckGoals";
import { Check } from "../../checkly/models";

export type MultipleCheckAnalysisResult = {
  goalSummary: string;
  allAnalysedChecks: Check[];
};

export const analyseMultipleChecks = async (
  arg?: string,
): Promise<MultipleCheckAnalysisResult> => {
  const targetChecks = await findTargetChecks(arg);

  const output = await generateText(
    summariseMultipleChecksGoal(targetChecks, { maxTokens: 200 }),
  );

  return {
    goalSummary: output.text,
    allAnalysedChecks: targetChecks,
  };
};
