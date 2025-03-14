import { generateObject, generateText, LanguageModelV1 } from "ai";
import {
  generateDeploymentSummaryPrompt,
  generateFindRepoPrompt,
  generateReleaseHeadlinePrompt,
  generateReleaseSummaryPrompt,
  generateTimeframePrompt,
  GithubRepoForPrompt,
} from "../prompts/github";
import GitHubAPI, { CompareCommitsResponse } from "./github";

export class GithubAgent {
  private model: LanguageModelV1;
  private github: GitHubAPI;

  constructor(model: LanguageModelV1, github: GitHubAPI) {
    this.model = model;
    this.github = github;
  }

  async singleSentenceReleaseSummary(
    org: string,
    repo: string,
    release: string,
    previousRelease: string,
  ) {
    let diff = await this.github.getDiffBetweenTags(
      org,
      repo,
      previousRelease,
      release,
    );

    const prompt = generateReleaseHeadlinePrompt(
      previousRelease,
      release,
      JSON.stringify(diff),
    );

    const { text } = await generateText(prompt);

    return { diff, summary: text };
  }

  async summarizeRelease({
    org,
    repo,
    release,
    previousRelease,
  }: {
    org: string;
    repo: string;
    release: string;
    previousRelease: string;
  }) {
    const diff = await this.github.getDiffBetweenTags(
      org,
      repo,
      previousRelease,
      release,
    );
    const commits = diff.commits.map((c) => {
      return {
        author: c.commit.author?.name || "unknown author",
        sha: c.sha,
        message: c.commit.message,
      };
    });

    const prompt = generateReleaseSummaryPrompt(previousRelease, release, {
      commits,
    });
    const { text } = await generateText(prompt);

    return { diff, summary: text };
  }

  async summarizeDeployment(
    org: string,
    repo: string,
    currentSha: string,
    previousSha: string,
  ): Promise<{ diff: CompareCommitsResponse; summary: string }> {
    const diff = await this.github.getDiffBetweenTags(
      org,
      repo,
      previousSha,
      currentSha,
    );

    const prompt = generateDeploymentSummaryPrompt(
      previousSha,
      currentSha,
      JSON.stringify(diff),
    );

    const { text } = await generateText(prompt);

    return { diff, summary: text };
  }

  async find_repo(org: string, userPrompt: string) {
    let repositories: GithubRepoForPrompt[] = (
      await this.github.queryRepositories(org)
    ).map((r) => ({
      name: r.name,
      description: r.description,
      link: r.html_url,
    }));

    const prompt = generateFindRepoPrompt(userPrompt, repositories);
    const { object } = await generateObject(prompt);

    return repositories.find((r) => r.name === object.repo) || undefined;
  }

  async get_date(org: string, userPrompt: string) {
    const prompt = generateTimeframePrompt();
    const { text } = await generateText(prompt);
    return text;
  }

  async summarizeReleases(prompt: string, org: string) {
    let repo = await this.find_repo(org, prompt);
    if (repo === undefined) {
      throw new Error("Could not find repository");
    }

    let since = await this.get_date(org, prompt);
    let releases = (
      await this.github.queryLatestReleases(org, repo.name, new Date(since))
    )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);

    let summaries = await Promise.all(
      releases.slice(0, -1).map(async (release, i) => {
        let previousRelease = releases[i + 1]?.tag || "";
        let { diff, summary } = await this.summarizeRelease({
          org,
          repo: repo.name,
          previousRelease,
          release: release.tag,
        });
        return {
          id: release.tag,
          release_date: release.date,
          link: release.link,
          diffLink: diff.html_url,
          summary: summary,
          authors: Array.from(
            new Set(diff.commits.map((commit) => commit.author)),
          ),
        };
      }),
    );

    return {
      repo: repo,
      since: since,
      releases: summaries,
    };
  }
}
