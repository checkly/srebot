import { Factuality, Summary } from "autoevals";

import dotenv from "dotenv";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";
import { GithubAgent } from "./agent";
import GitHubAPI from "./github";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const CHECKLY_GITHUB_TOKEN = process.env.CHECKLY_GITHUB_TOKEN!;

jest.setTimeout(120000); // Set timeout to 120 seconds

describe("GithubAgent Tests", () => {
  let openai: OpenAIProvider;
  let github: GitHubAPI;

  beforeAll(() => {
    openai = createOpenAI({ apiKey: OPENAI_API_KEY });
    github = new GitHubAPI(CHECKLY_GITHUB_TOKEN);
  });

  it("should summarize releases by prompt", async () => {
    let agent = new GithubAgent(openai("gpt-4o"), github);

    const data = {
      org: "checkly",
      repo: "checkly-webapp",
      baseTag: "2024-11-15-12.56.18",
      headTag: "2024-11-15-11.29.32",
    };

    const input = JSON.stringify(
      github.getDiffBetweenTags(
        data.org,
        data.repo,
        data.baseTag,
        data.headTag,
      ),
    );

    const output = (
      await agent.summarizeRelease(
        data.org,
        data.repo,
        data.baseTag,
        data.headTag,
      )
    ).summary;

    const expected =
      "*Commit 5ab077a55df269bb06b34e65766ec1258c2ece63:*\n" +
      "- *Title*: chore: improve last prod sha handling (#7603)\n" +
      "- *Author*: Sergii Bezliudnyi\n" +
      "- *Description*: This commit aimed to improve the handling of the last production SHA. The specific changes made to achieve this are not detailed in the summary.\n" +
      "\n" +
      "*Commit 20df6f9050cd09e6f13635484385c7858eb2bcb8:*\n" +
      '- *Title*: Revert "chore: improve last prod sha handling (#7603)" (#7604)\n' +
      "- *Author*: Javier Pérez\n" +
      "- *Description*: This commit reverts the changes made in the previous commit (5ab077a55df269bb06b34e65766ec1258c2ece63). The reason for the reversion is not specified, but it indicates that the changes introduced in the previous commit were not suitable or caused issues.";

    const result = await Summary({ output, expected, input });
    if (result.score === 0) {
      console.log(`Summary score: ${result.score}`);
      console.log(`Summary metadata: ${result.metadata?.rationale}`);
    }
    expect(result.score).toBe(1);
  });
});
