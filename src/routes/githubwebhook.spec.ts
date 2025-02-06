import { PrismaClient } from "@prisma/client";
import GitHubAPI from "../github/github";
import { getOpenaiSDKClient } from "../ai/openai";
import { GithubAgent } from "../github/agent";

const prisma = new PrismaClient();
const CHECKLY_GITHUB_TOKEN = process.env.CHECKLY_GITHUB_TOKEN!;

const github = new GitHubAPI(CHECKLY_GITHUB_TOKEN);

let setupAgent = () => {
  let openai = getOpenaiSDKClient();

  return new GithubAgent(openai("gpt-4o"), github);
};

const githubAgent = setupAgent();

describe("Load github releases into db", () => {
  it.skip("should add releases to the db", async () => {
    const org = "checkly";
    const repo = "checkly-backend";
    const timeframe = "1 days";

    let summary = await githubAgent.summarizeReleases(
      `what has changed in the ${repo} within the last ${timeframe}`,
      org,
    );

    for (const release of summary.releases) {
      const authors = release.authors
        .filter((author) => author !== null)
        .map((author) => author.login);

      await prisma.release.create({
        data: {
          name: release.id,
          releaseUrl: release.link,
          publishedAt: release.release_date,
          org: org,
          repo: summary.repo.name,
          repoUrl: summary.repo.link,
          tag: release.id,
          diffUrl: release.diffLink,
          authors,
          summary: release.summary,
        },
      });
    }
  }, 600000000);
});
