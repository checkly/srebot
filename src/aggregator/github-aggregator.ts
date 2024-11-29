import GitHubAPI from "../github/github";
import { WebhookAlertDto } from "../checkly/alertDTO";
import { CheckContext, ContextKey } from "./ContextAggregator";
import moment from "moment";

// Configure repositories to monitor
const REPOS = process.env.GITHUB_REPOS
	? JSON.parse(process.env.GITHUB_REPOS)
	: [];
const githubApi = new GitHubAPI(process.env.GITHUB_TOKEN || "");

interface RepoChange {
	repo: string;
	commits: Array<{
		sha: string;
		message: string;
		author: string;
		date: string;
	}>;
	pullRequests: Array<{
		number: number;
		title: string;
		state: string;
		author: string;
		url: string;
	}>;
}

async function getRecentChanges(repo: string): Promise<RepoChange> {
	const [owner, repoName] = repo.split("/");
	const since = moment().subtract(24, "hours").toISOString();

	// Get recent commits
	const commits = await githubApi.getCommits(owner, repoName, { since });

	// Get recent pull requests
	const pullRequests = await githubApi.getPullRequests(owner, repoName);

	// Filter PRs updated in the last 24 hours
	const recentPRs = pullRequests.filter((pr) =>
		moment(pr.updated_at).isAfter(moment().subtract(24, "hours"))
	);

	return {
		repo,
		commits: commits.map((commit) => ({
			sha: commit.sha,
			message: commit.commit.message,
			author: commit.commit.author?.name || "Unknown",
			date: commit.commit.author?.date || "",
		})),
		pullRequests: recentPRs.map((pr) => ({
			number: pr.number,
			title: pr.title,
			state: pr.state,
			author: pr.user?.login || "Unknown",
			url: pr.html_url,
		})),
	};
}

export async function githubAggregator(
	alert: WebhookAlertDto
): Promise<CheckContext[]> {
	try {
		const contexts: CheckContext[] = [];

		// If no repos configured, try to get all repos from the organization
		if (REPOS.length === 0 && process.env.GITHUB_ORG) {
			const repos = await githubApi.queryRepositories(process.env.GITHUB_ORG);
			REPOS.push(
				...repos.map((repo) => `${process.env.GITHUB_ORG}/${repo.name}`)
			);
		}

		// Fetch changes for all configured repositories
		const repoChanges = await Promise.all(
			REPOS.map((repo) => getRecentChanges(repo))
		);

		// Create a summary of all changes
		const changesSummary = repoChanges
			.filter(
				(changes) =>
					changes.commits.length > 0 || changes.pullRequests.length > 0
			)
			.map((changes) => {
				const commitCount = changes.commits.length;
				const prCount = changes.pullRequests.length;
				return `${changes.repo}: ${commitCount} commits, ${prCount} PR updates`;
			})
			.join("\n");

		if (changesSummary) {
			contexts.push({
				checkId: alert.CHECK_ID,
				source: "github",
				key: ContextKey.ChecklyCheck,
				value: repoChanges,
				analysis: `GitHub changes in the last 24h:\n${changesSummary}`,
			});
		}

		return contexts;
	} catch (error) {
		console.error("Error in GitHub aggregator:", error);
		return [];
	}
}
