import GitHubAPI from "../github/github";
import { WebhookAlertDto } from "../checkly/alertDTO";
import { CheckContext, ContextKey } from "./ContextAggregator";
import {
	getLastSuccessfulCheckResult,
	mapCheckResultToContextValue,
	mapCheckToContextValue,
} from "../checkly/utils";
import { prisma } from "../prisma";
import { generateObject } from "ai";
import { getOpenaiSDKClient } from "../ai/openai";
import { checkly } from "../checkly/client";
import { stringify } from "yaml";
import { z } from "zod";
import { Release } from "@prisma/client";

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

// async function getRecentChanges(repo: string): Promise<RepoChange> {
// 	const [owner, repoName] = repo.split("/");
// 	const since = moment().subtract(24, "hours").toISOString();

// 	// Get recent commits
// 	const commits = await githubApi
// 		.getCommits(owner, repoName, { since })
// 		.catch((error) => {
// 			console.error("Error fetching commits:", error);
// 			return [];
// 		});

// 	// Get recent pull requests
// 	const pullRequests = await githubApi.getPullRequests(owner, repoName);

// 	// Get recent releases
// 	const releases = await githubApi.queryLatestReleasesWithDiffs(
// 		owner,
// 		repoName,
// 		new Date(since)
// 	);

// 	// Filter PRs updated in the last 24 hours
// 	const recentPRs = pullRequests.filter((pr) =>
// 		moment(pr.updated_at).isAfter(moment().subtract(24, "hours"))
// 	);

// 	return {
// 		repo,
// 		commits: commits.map((commit) => ({
// 			sha: commit.sha,
// 			message: commit.commit.message,
// 			author: commit.commit.author?.name || "Unknown",
// 			date: commit.commit.author?.date || "",
// 		})),
// 		pullRequests: recentPRs.map((pr) => ({
// 			number: pr.number,
// 			title: pr.title,
// 			state: pr.state,
// 			author: pr.user?.login || "Unknown",
// 			url: pr.html_url,
// 		})),
// 		releases: releases.map((release) => ({
// 			release: release.release,
// 			diff: release.diff,
// 		})),
// 	};
// }

export const githubAggregator = {
	name: "GitHub",
	fetchContext: async (alert: WebhookAlertDto): Promise<CheckContext[]> => {
		console.log("Aggregating GitHub Context...");
		try {
			await githubApi.checkRateLimit();

			const lastSuccessfulCheckResult = await getLastSuccessfulCheckResult(
				alert.CHECK_ID
			);

			const failureResults = await checkly.getCheckResult(
				alert.CHECK_ID,
				alert.CHECK_RESULT_ID
			);

			const check = await checkly.getCheck(alert.CHECK_ID);

			const releases = await prisma.release.findMany({
				where: {
					publishedAt: {
						gte: new Date(lastSuccessfulCheckResult.startedAt),
					},
				},
			});

			const { object: relevantReleaseIds } = await generateObject({
				model: getOpenaiSDKClient()("gpt-4o"),
				prompt: `Based on the following releases, which ones are most relevant to the check state change? Analyze the check script, result and releases to determine which releases are most relevant. Provide a list of release ids that are most relevant to the check.

Releases:
${stringify(
	releases.map((r) => ({
		id: r.id,
		repo: r.repoUrl,
		release: r.name,
		summary: r.summary,
	}))
)}

Check:
${stringify(mapCheckToContextValue(check))}

Check Script:
${check.script}

Check Result:
${stringify(mapCheckResultToContextValue(failureResults))}`,
				schema: z.object({
					releaseIds: z
						.array(z.string())
						.describe(
							"The ids of the releases that are most relevant to the check failure."
						),
				}),
			});

			const relevantReleases = releases.filter((r) =>
				relevantReleaseIds.releaseIds.includes(r.id)
			);

			const makeRepoReleaseContext = (release: Release) =>
				({
					key: ContextKey.GitHubReleaseSummary.replace(
						"$repo",
						`${release.org}/${release.repo}`
					),
					value: release,
					checkId: alert.CHECK_ID,
					source: "github",
				} as CheckContext);

			if (relevantReleases) {
				const context = relevantReleases.map((release) =>
					makeRepoReleaseContext(release)
				);
				return context;
			}

			return [];
		} catch (error) {
			console.error("Error in GitHub aggregator:", error);
			return [];
		}
	},
};
