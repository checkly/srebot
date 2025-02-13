import { expect } from "@jest/globals";
import {
  Summary as EvalSummary,
  Score as EvalScore,
  Possible as EvalPossible,
  Factuality as EvalFactuality,
  AnswerRelevancy as EvalAnswerRelevancy,
  Battle as EvalBattle,
  ScorerWithPartial,
  LLMClassifierArgs,
} from "autoevals";

interface Scorer {
  score: (output: string) => ScorerResult | Promise<ScorerResult>;
}

interface ScorerResult {
  args: any;
  output: string;
  score: EvalScore;
  message: string;
}

/**
 * Creates a scorer that wraps an autoeval scorer function
 */
function createScorer(
  evalFn: ScorerWithPartial<string, LLMClassifierArgs<{}>>,
  args: Omit<LLMClassifierArgs<{}>, "output">,
): Scorer {
  return {
    score: async (output: string): Promise<ScorerResult> => {
      let score = await evalFn({ ...args, output });

      return {
        output,
        args,
        score,
        message:
          "" +
          `Type: ${score.name}, Score: ${score.score}\n\n` +
          `${Object.entries(args)
            .filter(([_, value]) => value !== undefined)
            .map(
              ([key, value]) =>
                `===== ${key[0].toUpperCase() + key.slice(1)} =====${JSON.stringify(value)}\n\n`,
            )
            .join("\n")}\n\n` +
          `===== Output =====\n${output}\n\n` +
          `===== Rationale =====\n${score.metadata?.rationale}`,
      };
    },
  };
}

/**
 * Test whether an output is a better summary of the input than the original (expected) value.
 */
export const Summary = function (
  args: Omit<Parameters<typeof EvalSummary>[0], "output">,
) {
  return createScorer(EvalSummary, args);
};

/**
 * Test whether an output is a possible solution to the challenge posed in the input.
 */
export const Possible = function (
  args: Omit<Parameters<typeof EvalPossible>[0], "output">,
) {
  return createScorer(EvalPossible, args);
};

/**
 * Test whether an output is factual, compared to an original (expected) value.
 */
export const Factuality = function (
  args: Omit<Parameters<typeof EvalFactuality>[0], "output">,
) {
  return createScorer(EvalFactuality, args);
};

/**
 * Scores the relevancy of the generated answer to the given question. Answers with incomplete, redundant or unnecessary information are penalized.
 */
export const AnswerRelevancy = function (
  args: Omit<Parameters<typeof EvalAnswerRelevancy>[0], "output">,
) {
  return createScorer(EvalAnswerRelevancy, args);
};

/**
 * Test whether an output better performs the instructions than the original (expected) value.
 */
export const Battle = function (
  args: Omit<Parameters<typeof EvalBattle>[0], "output">,
) {
  return createScorer(EvalBattle, args);
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
  async toScoreGreaterThanOrEqual(
    output: string,
    { score }: Scorer,
    threshold: number,
  ) {
    const result = await score(output);
    const pass = result.score.score ? result.score.score >= threshold : false;
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
    toScoreGreaterThanOrEqual(scorer: Scorer, threshold: number): void;
  }
  interface Matchers<R> {
    toScorePerfect(scorer: Scorer): R;
    toScoreGreaterThanOrEqual(scorer: Scorer, threshold: number): R;
  }
}
