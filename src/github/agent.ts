import { z } from "zod";
import { generateObject, generateText, LanguageModelV1, tool } from "ai";
import GitHubAPI from "./github";

export class GithubAgent {
	private model: LanguageModelV1;
	private github: GitHubAPI;

	constructor(model: LanguageModelV1, github: GitHubAPI) {
		this.model = model;
		this.github = github;
	}

	async summarizeRelease(
		org: string,
		repo: string,
		release: string,
		previousRelease: string
	) {
		let diff = await this.github.getDiffBetweenTags(
			org,
			repo,
			release,
			previousRelease
		);

		const { text } = await generateText({
			model: this.model,
			prompt: `The following diff describes the changes between ${previousRelease} and ${release}. Summarize the changes so that another developer quickly understands what has changes: ${JSON.stringify(
				diff
			)}. Do not describe the outer context as the developer is already aware. Do not yap.`,
		});

		return { diff, summary: text };
	}

	async find_repo(org: string, prompt: string) {
		let repositories = (await this.github.queryRepositories(org)).map((r) => ({
			name: r.name,
			description: r.description,
			link: r.html_url,
		}));

		// const { text } = await generateText({
		//   model: this.model,
		//   system: `A developer describes a task which is about a repository in his github organization. Select the repository he is most likely talking about and give me only its name. This list of posible repos is the following: ${JSON.stringify(repositories)}`,
		//   prompt,
		// });

		const { object } = await generateObject({
			model: this.model,
			prompt: `Based on the following prompt: ${prompt} and the list of repositories\n\n${JSON.stringify(
				repositories
			)}\n\n, select the repository that is most relevant to the prompt.`,
			schema: z.object({
				repo: z.enum(repositories.map((r) => r.name) as [string, ...string[]]),
			}),
		});

		return repositories.find((r) => r.name === object.repo) || undefined;
	}

	async get_date(org: string, prompt: string) {
		const { text } = await generateText({
			model: this.model,
			system: `A developer describes a task which is about a certain time frame. Based on his prompt choose identify the date in ISO8601 format. If you cannot find a timeframe return the date from 24h ago. Today is ${new Date().toISOString()}. Do not yap.`,
			prompt,
		});

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
				let { diff, summary } = await this.summarizeRelease(
					org,
					repo.name,
					release.tag,
					previousRelease
				);
				console.log(JSON.stringify(diff, undefined, 2));
				return {
					id: release.tag,
					release_date: release.date,
					link: release.link,
					summary: summary,
					authors: Array.from(new Set(diff.commits.map((c) => c.author))),
				};
			})
		);

		return {
			repo: repo,
			since: since,
			releases: summaries,
		};
	}
}
