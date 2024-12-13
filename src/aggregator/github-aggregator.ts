import GitHubAPI from "../github/github";
import { WebhookAlertDto } from "../checkly/alertDTO";
import { CheckContext, ContextKey } from "./ContextAggregator";
import moment from "moment";
import { getLastSuccessfulCheckResult } from "src/checkly/utils";
import { prisma } from "src/prisma";

const githubApi = new GitHubAPI(process.env.CHECKLY_GITHUB_TOKEN || "");

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
	releases: Array<{
		release: string;
		diff: string;
	}>;
}

async function getRecentChanges(repo: string): Promise<RepoChange> {
	const [owner, repoName] = repo.split("/");
	const since = moment().subtract(24, "hours").toISOString();

	// Get recent commits
	const commits = await githubApi
		.getCommits(owner, repoName, { since })
		.catch((error) => {
			console.error("Error fetching commits:", error);
			return [];
		});

	// Get recent pull requests
	const pullRequests = await githubApi.getPullRequests(owner, repoName);

	// Get recent releases
	const releases = await githubApi.queryLatestReleasesWithDiffs(
		owner,
		repoName,
		new Date(since)
	);

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
		releases: releases.map((release) => ({
			release: release.release,
			diff: release.diff,
		})),
	};
}

export const githubAggregator = {
	name: "GitHub",
	fetchContext: async (alert: WebhookAlertDto): Promise<CheckContext[]> => {
		console.log("Aggregating GitHub Context...");
		try {
			await githubApi.checkRateLimit();

			const lastSuccessfulCheckResult = await getLastSuccessfulCheckResult(
				alert.CHECK_ID
			);

			const REPOS = process.env.GITHUB_REPOS
				? JSON.parse(process.env.GITHUB_REPOS)
				: [];

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

			const makeRepoChangesContext = (repoChange: RepoChange) =>
				({
					key: ContextKey.GitHubRepoChanges.replace("$repo", repoChange.repo),
					value: repoChange,
					checkId: alert.CHECK_ID,
					source: "github",
				} as CheckContext);

			if (repoChanges) {
				const context = repoChanges
					.filter(
						(repoChange) =>
							repoChange.commits.length > 0 ||
							repoChange.pullRequests.length > 0 ||
							repoChange.releases.length > 0
					)
					.map((repoChange) => makeRepoChangesContext(repoChange));

				return context;
			}

			return [];
		} catch (error) {
			console.error("Error in GitHub aggregator:", error);
			return [];
		}
	},
};
