import { z } from 'zod';
import { generateText, LanguageModelV1, tool } from 'ai';
import GitHubAPI from './github';

export class GithubAgent {
  private model: LanguageModelV1;
  private github: GitHubAPI;

  constructor(model: LanguageModelV1, github: GitHubAPI) {
    this.model = model;
    this.github = github;
  }

  async summarizeRelease(org: string, repo: string, release: string, previousRelease: string) {
    let diff = await this.github.getDiffBetweenTags(org, repo, release, previousRelease);

    const { text } = await generateText({
      model: this.model,
      prompt: `The following diff describes the changes between ${previousRelease} and ${release}. Summarize the changes so that another developer quickly understands what has changes: ${JSON.stringify(diff)}. Do not describe the outer context as the developer is already aware. Do not yap.`
    });
     
    return text;
  }

  async find_repo(org: string, prompt: string) {
    let repositories = (await this.github.queryRepositories(org)).map(r => ({name: r.name, description: r.description}));

    const { text } = await generateText({
      model: this.model,
      system: `A developer describes a task which is about a repository in his github organization. Select the repository he is most likely talking about and give me only its name. This list of posible repos is the following: ${JSON.stringify(repositories)}`,
      prompt,
    });
     
    return text;
  }

  async get_date(org: string, prompt: string) {
    const { text } = await generateText({
      model: this.model,
      system: `A developer describes a task which is about a certain time frame. Based on his prompt choose the correct date. If you cannot find a timeframe return the date from 24h ago. Today is ${new Date().toISOString()}`,
      prompt,
    });
     
    return text;
  }

  async summarizeReleases(prompt: string, org: string) {
    let repo = await this.find_repo(org, prompt);
    let since = await this.get_date(org, prompt);
    let releases = await this.github.queryLatestReleases(org, repo, new Date(since));

    return await Promise.all(releases.slice(0, -1).map(async (release, i) => {
      let previousRelease = releases[i + 1]?.tag || '';
      let summary = await this.summarizeRelease(org, repo, release.tag, previousRelease);
      return {
        id: release.tag,
        repo: repo,
        release_date: release.date,
        summary: summary
      };
    }));     
  }
}