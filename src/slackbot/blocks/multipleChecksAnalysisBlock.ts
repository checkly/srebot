import { MultipleCheckAnalysisResult } from "../../use-cases/analyse-multiple/analyse-multiple-checks";

export function createMultipleCheckAnalysisBlock(
  analysisResult: MultipleCheckAnalysisResult,
) {
  return {
    text: `*Multiple Check Analysis*`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Blast radius`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `* ${analysisResult.allAnalysedChecks.length} checks analysed\n* ${analysisResult.goalSummary}`,
        },
      },
    ],
  };
}
