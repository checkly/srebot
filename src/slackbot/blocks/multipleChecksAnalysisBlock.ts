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
          text: `Impact Analysis:\n* ${analysisResult.allAnalysedChecks.length} checks analysed\n* ${analysisResult.goalSummary.response.map((group, index) => `${index + 1}. **${group.header}**: ${group.description}`).join("\n")}`,
        },
      },
    ],
  };
}
