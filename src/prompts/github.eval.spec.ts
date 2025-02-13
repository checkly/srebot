import { expect, test } from "@jest/globals";
import "./toScoreMatcher";

import dotenv from "dotenv";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";
import GitHubAPI from "../github/github";
import { startLangfuseTelemetrySDK } from "../langfuse";
import { generateReleaseSummaryPrompt } from "./github";
import { generateText } from "ai";
import { Summary } from "./toScoreMatcher";

startLangfuseTelemetrySDK();

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const CHECKLY_GITHUB_TOKEN = process.env.CHECKLY_GITHUB_TOKEN!;

jest.setTimeout(120000);

describe("Github Prompt Tests", () => {
  let openai: OpenAIProvider;
  let github: GitHubAPI;

  beforeAll(() => {
    openai = createOpenAI({ apiKey: OPENAI_API_KEY });
    github = new GitHubAPI(CHECKLY_GITHUB_TOKEN);
  });

  it("should summarize releases by prompt", async () => {
    const { baseTag, headTag } = {
      baseTag: "2025-02-07-15.59.26",
      headTag: "2025-02-11-17.04.27",
    };

    const input = {
      commits: [
        {
          sha: "9f2db4a2cbf4439fe6afd2bfd31cf4a35b1b3047",
          author: "Michelle Liebheit",
          message: "feat: update vercel onboarding flow [sc-00] (#7852)",
        },
        {
          sha: "08578b470e285ed55d544b5338f3c7776e0f63aa",
          author: "Sergii Bezliudnyi",
          message: "feat: reduce response data comparison options (#7854)",
        },
        {
          sha: "15d6190cd42d68df6b5b207c59d11765067a6b69",
          author: "Sergii Bezliudnyi",
          message:
            "chore: bump deps to fix nodegyp errs (#7853)\n\n* chore: bump deps to fix nodegyp errs\n\n* chore: attempt lockfile update\n\n---------\n\nCo-authored-by: Javier Pérez <kiroushi@gmail.com>",
        },
        {
          sha: "356749fc14a99286d7f047f1cef00275a8de490e",
          author: "Javier Pérez",
          message:
            'refactor: drop vueuse "usescripttag" to load featurebase (#7859)',
        },
        {
          sha: "e9599b6706260cb707916f8a47b78a36730380d8",
          author: "Pilar",
          message: "fix: remove beta tag [sc-00] (#7860)",
        },
      ],
    };

    const [prompt, config] = generateReleaseSummaryPrompt(
      baseTag,
      headTag,
      input,
    );

    const { text: summary } = await generateText({
      ...config,
      prompt,
    });

    const expected = `
      feat: update vercel onboarding flow [sc-00] (#7852)

      Commit: 9f2db4a2cbf4439fe6afd2bfd31cf4a35b1b3047
      Author: Michelle Liebheit
      Summary: Updated the Vercel onboarding flow, potentially improving user experience during the onboarding process.
      feat: reduce response data comparison options (#7854)

      Commit: 08578b470e285ed55d544b5338f3c7776e0f63aa
      Author: Sergii Bezliudnyi
      Summary: Reduced the options for response data comparison, likely simplifying the comparison logic and improving performance.
      chore: bump deps to fix nodegyp errs (#7853)

      Commit: 15d6190cd42d68df6b5b207c59d11765067a6b69
      Author: Sergii Bezliudnyi
      Summary: Bumped dependencies to resolve nodegyp errors, ensuring smoother builds and dependency management. Attempted lockfile update to maintain consistency.
      refactor: drop vueuse "usescripttag" to load featurebase (#7859)

      Commit: 356749fc14a99286d7f047f1cef00275a8de490e
      Author: Javier Pérez
      Summary: Refactored code to remove the use of vueuse "usescripttag" for loading featurebase, possibly streamlining the loading process.
      fix: remove beta tag [sc-00] (#7860)`;

    await expect(summary).toScorePerfect(
      Summary({
        expected,
        input: JSON.stringify(input),
      }),
    );
  });
});
