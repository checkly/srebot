import { expect } from "@jest/globals";
import {
  LLMClassifierArgs,
  ScorerArgs,
  Summary as EvalSummary,
  Score as EvalScore,
} from "autoevals";
import type { MatcherFunction } from "expect";

interface Scorer {
  score: (output: string) => ScorerResult | Promise<ScorerResult>;
}

interface ScorerResult {
  args: any;
  output: string;
  score: EvalScore;
  message: string;
}

export const Summary = function (
  args: Omit<Parameters<typeof EvalSummary>[0], "output">,
) {
  return {
    score: async (output: string) => {
      let score = await EvalSummary({ output: "output", ...args });

      return {
        output,
        args,
        score,
        message: `Type: ${score.name}, Score: ${score.score}\n\n===== Output =====\n${output}\n\n===== Expected =====\n${args.expected}\n\n===== Rationale =====\n${score.metadata?.rationale}`,
      };
    },
  };
};
expect.extend({
  async toScorePerfect(output: string, { score }: Scorer) {
    const result = await score(output);
    const pass = result.score.score ? result.score.score == 1 : false;
    return {
      pass,
      result,
      message: () => result.message,
    };
  },
});

declare module "expect" {
  interface AsymmetricMatchers {
    toScorePerfect(scorer: Scorer): void;
  }
  interface Matchers<R> {
    toScorePerfect(scorer: Scorer): R;
  }
}
