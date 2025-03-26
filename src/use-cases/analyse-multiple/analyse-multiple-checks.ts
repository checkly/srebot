import { findTargetChecks } from "./find-target-checks";
import { generateObject } from "ai";
import { summariseMultipleChecksGoal } from "../../prompts/summarizeCheckGoals";
import { Check } from "../../checkly/models";
import { MultipleChecksGoalResponse } from "../../prompts/summarizeCheckGoals";

export type MultipleCheckAnalysisResult = {
  goalSummary: MultipleChecksGoalResponse;
  allAnalysedChecks: Check[];
};

export const analyseMultipleChecks = async (
  arg?: string,
): Promise<MultipleCheckAnalysisResult> => {
  const targetChecks = await findTargetChecks(arg);

  const output = await generateObject<MultipleChecksGoalResponse>(
    summariseMultipleChecksGoal(targetChecks, { maxTokens: 500 }),
  );

  return {
    goalSummary: output.object,
    allAnalysedChecks: targetChecks,
  };
};
