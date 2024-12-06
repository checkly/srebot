import { z } from "zod";
import { Tool, createToolParameters, createToolOutput } from "../../ai/Tool";
import { SreAssistant } from "../SreAssistant";
import { stringify } from "yaml";
import GitHubAPI from "../../github/github";

const githubApi = new GitHubAPI(process.env.CHECKLY_GITHUB_TOKEN || "");
const MAX_RESPONSE_LENGTH = 90000;
const parameters = createToolParameters(
	z.object({
		action: z
			.enum(["getCommitHistory", "listRepositories"])
			.describe("The action to perform on the GitHub API"),
		repo: z
			.string()
			.describe(
				"The full_name of the repository to get information about (e.g. 'checkly/checkly-cli')"
			)
			.optional(),
	})
);

const outputSchema = createToolOutput(
	z.string().describe("The response from the GitHub API")
);

export class GitHubTool extends Tool<
	typeof parameters,
	typeof outputSchema,
	SreAssistant
> {
	static parameters = parameters;
	static outputSchema = outputSchema;

	constructor(agent: SreAssistant) {
		super({
			name: "GitHubAPI",
			description:
				"Interact with the GitHub API to retrieve relevant context about repositories and commits.",
			parameters,
			agent,
		});
	}

	async execute(input: z.infer<typeof parameters>) {
		if (input.action === "getCommitHistory") {
			const [owner, repo] = input.repo!.split("/");
			const commits = await githubApi.getCommits(owner, repo);
			return stringify(
				commits.map((c) => ({
					sha: c.sha,
					message: c.commit.message,
					author: c.commit.author,
					url: c.html_url,
					files: c.files?.map((f) => ({
						filename: f.filename,
						status: f.status,
						patch: f.patch,
						url: f.blob_url,
					})),
				}))
			).slice(0, MAX_RESPONSE_LENGTH);
		} else if (input.action === "listRepositories") {
			const repos = await githubApi.queryRepositories(
				process.env.GITHUB_ORG as string
			);
			return stringify(
				repos.map((r) => ({
					full_name: r.full_name,
					description: r.description,
					last_pushed: r.pushed_at,
					url: r.html_url,
				}))
			);
		}

		return "Invalid action";
	}
}
