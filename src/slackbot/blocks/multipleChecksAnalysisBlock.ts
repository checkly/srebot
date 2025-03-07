import { MultipleCheckAnalysisResult } from "../../use-cases/analyse-multiple/analyse-multiple-checks";

export function createMultipleCheckAnalysisBlock(
  analysisResult: MultipleCheckAnalysisResult,
) {
  return {
    text: `*Multiple Check Analysis*`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Blast Radius:\n* ${analysisResult.allAnalysedChecks.length} checks analysed\n* ${analysisResult.goalSummary}`,
        },
      },
    ],
  };
}
