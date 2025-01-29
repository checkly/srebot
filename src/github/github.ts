import { Octokit } from "octokit";
import { Endpoints } from "@octokit/types";
import type {
  RestEndpointMethodTypes
} from "@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types";

type Repository = Endpoints["GET /repos/{owner}/{repo}"]["response"]["data"];
type ListReleasesResponse =
  Endpoints["GET /repos/{owner}/{repo}/releases"]["response"]["data"];
export type CompareCommitsResponse =
  Endpoints["GET /repos/{owner}/{repo}/compare/{base}...{head}"]["response"]["data"];
export type GithubDeploymentInstance = RestEndpointMethodTypes["repos"]["listDeployments"]["response"]["data"][0]

class GitHubAPI {
  private octokit: Octokit;

  constructor(githubToken: string) {
    this.octokit = new Octokit({ auth: githubToken });
  }

  async queryRepositories(org: string) {
    try {
      const { data: repositories } = await this.octokit.rest.repos.listForOrg({
        org,
        sort: "updated",
        direction: "desc",
        per_page: 100,
      });
      return repositories;
    } catch (error) {
      console.error("Error querying GitHub repositories:", error);
      throw error;
    }
  }

  async getPreviousReleaseTag(org: string, repoName: string, release: string):Promise<string> {
    try {
      const { data: releases } = await this.octokit.rest.repos.listReleases({
        owner: org,
        repo: repoName,
      });

      const releaseIndex = releases.findIndex((r) => r.tag_name === release);
      if (releaseIndex === -1) {
        throw new Error(`Release ${release} not found`);
      } else if (releaseIndex === releases.length - 1) {
        return "";
      } else {
        return releases[releaseIndex + 1].tag_name;
      }
    } catch (error) {
      console.error("Error querying GitHub releases:", error);
      throw error;
    }
  }

  async getPreviousDeployment(
    org: string,
    repoName: string,
    environment: string,
    currentDeploymentId: number,
    currentDeploymentSha: string
  ): Promise<GithubDeploymentInstance|null> {
    try {
      const { data: deployments }  = await this.octokit.rest.repos.listDeployments({
        owner: org,
        repo: repoName,
        environment,
        per_page: 100, // Fetch up to 100 deployments at once (max allowed by GitHub)
      });

      // Find the index of the current deployment
      const currentDeploymentIndex = deployments.findIndex(
        (d) => d.id === currentDeploymentId
      );

      if (currentDeploymentIndex === -1) {
        throw new Error(`Deployment with ID ${currentDeploymentId} not found`);
      }

      const previousDeployment = deployments.slice(currentDeploymentIndex).find(
        (d => d.sha !== currentDeploymentSha),
      )

      return previousDeployment || null;
    } catch (error) {
      console.error("Error querying GitHub deployments:", error);
      throw error;
    }
  }

  async queryLatestReleases(org: string, repoName: string, since: Date) {
    try {
      let { data: releases } = await this.octokit.rest.repos.listReleases({
        owner: org,
        repo: repoName,
      });

      return releases
        .filter((release) => {
          return new Date(release.created_at) > since;
        })
        .map((release) => ({
          id: release.id,
          tag: release.tag_name,
          author: release.author.name,
          date: release.created_at,
          link: release.html_url,
        }));
    } catch (error) {
      console.error("Error querying GitHub releases:", error);
      throw error;
    }
  }

  async checkRateLimit() {
    try {
      const response = await this.octokit.rest.rateLimit.get();

      if (response.data.resources.core.remaining === 0) {
        throw new Error("Rate limit exceeded");
      }
    } catch (error) {
      console.error("Error checking rate limit:", error);
      throw error;
    }
  }

  async getReleaseAuthors(owner: string, repo: string, tag_name: string) {
    let commits = await this.octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: tag_name,
    });

    return commits.data.map((commit) => commit.author);
  }

  async getDiffBetweenTags(
    org: string,
    repo: string,
    baseTag: string,
    headTag: string
  ): Promise<CompareCommitsResponse> {
    try {
      const { data: diff } = await this.octokit.rest.repos.compareCommits({
        owner: org,
        repo,
        base: baseTag,
        head: headTag,
      });
      return diff;
    } catch (error) {
      console.error("Error fetching diff between tags:", error);
      throw error;
    }
  }

  async queryLatestReleasesWithDiffs(
    org: string,
    repoName: string,
    since: Date
  ) {
    const releases = await this.queryLatestReleases(org, repoName, since);

    if (releases.length < 2) {
      return releases;
    }

    const releaseDiffs = await Promise.all(
      releases.slice(0, -1).map(async (release, i) => {
        const previousRelease = releases[i + 1];
        const diff = await this.getDiffBetweenTags(
          org,
          repoName,
          previousRelease.tag,
          release.tag
        );
        return { release, diff };
      })
    );

    return releaseDiffs;
  }

  async getCommits(
    owner: string,
    repo: string,
    options: { since?: string } = {}
  ) {
    try {
      const { data: commits } = await this.octokit.rest.repos.listCommits({
        owner,
        repo,
        since: options.since,
      });
      return commits;
    } catch (error) {
      console.error("Error fetching commits:", error);
      throw error;
    }
  }

  async getPullRequests(
    owner: string,
    repo: string,
    options: { state?: "open" | "closed" | "all" } = { state: "all" }
  ) {
    try {
      const { data: pullRequests } = await this.octokit.rest.pulls.list({
        owner,
        repo,
        state: options.state,
        sort: "updated",
        direction: "desc",
      });
      return pullRequests;
    } catch (error) {
      console.error("Error fetching pull requests:", error);
      throw error;
    }
  }
}

export default GitHubAPI;
