import { findTargetChecks } from "./find-target-checks";
import { generateText } from "ai";
import { summariseMultipleChecksGoal } from "../../prompts/checkly";
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
    summariseMultipleChecksGoal(targetChecks, { maxTokens: 30 }),
  );

  return {
    goalSummary: output.text,
    allAnalysedChecks: targetChecks,
  };
};
