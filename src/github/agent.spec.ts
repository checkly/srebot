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

  it.skip("should summarize a single release", async () => {
    let agent = new GithubAgent(openai("gpt-4o"), github);
    let response = await agent.summarizeRelease({
      org: "checkly",
      repo: "checkly-webapp",
      previousRelease: "2025-02-07-15.59.26",
      release: "2025-02-11-17.04.27",
    });
    console.log(response);
  });

  it.skip("should summarize releases by prompt", async () => {
    let agent = new GithubAgent(openai("gpt-4o"), github);
    let response = await agent.summarizeReleases(
      "what changed in the ui since yesterday",
      "checkly",
    );
    console.log(response);
  });
});
