import { Octokit } from 'octokit';
import { Endpoints } from '@octokit/types';

type Repository = Endpoints['GET /repos/{owner}/{repo}']['response']['data'];
type ListReleasesResponse = Endpoints['GET /repos/{owner}/{repo}/releases']['response']['data'];
type CompareCommitsResponse = Endpoints['GET /repos/{owner}/{repo}/compare/{base}...{head}']['response']['data'];

class GitHubAPI {
  private octokit: Octokit;

  constructor(githubToken: string) {
    this.octokit = new Octokit({ auth: githubToken });
  }

  async queryRepositories(org: string) {
    try {
      const { data: repositories } = await this.octokit.rest.repos.listForOrg({
        org,
      });
      return repositories;
    } catch (error) {
      console.error('Error querying GitHub repositories:', error);
      throw error;
    }
  }

  async queryLatestReleases(org: string, repoName: string, since: Date) {
    try {
      let { data: releases } = await this.octokit.rest.repos.listReleases({
        owner: org,
        repo: repoName,
      });

      return releases.filter(release => {
        return new Date(release.created_at) > since;
      }).map(release => ({
        id: release.id,
        tag: release.tag_name,
        author: release.author.name,
        date: release.created_at,
        link: release.html_url,
      }));
    } catch (error) {
      console.error('Error querying GitHub releases:', error);
      throw error;
    }
  }

  async checkRateLimit() {
    try {
      const response = await this.octokit.rest.rateLimit.get();
      console.log(response.data);
    } catch (error) {
      console.error('Error checking rate limit:', error);
      throw error;
    }
  }

  async getReleaseAuthors(owner: string, repo: string, tag_name: string) {
    let commits = await this.octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: tag_name,
    })
    
    return commits.data.map(commit => commit.author);
  }


  async getDiffBetweenTags(org: string, repo: string, baseTag: string, headTag: string): Promise<CompareCommitsResponse> {
    try {
      const { data: diff } = await this.octokit.rest.repos.compareCommits({
        owner: org,
        repo,
        base: baseTag,
        head: headTag,
      });
      return diff;
    } catch (error) {
      console.error('Error fetching diff between tags:', error);
      throw error;
    }
  }

  async queryLatestReleasesWithDiffs(org: string, repoName: string, since: Date) {
    const releases = await this.queryLatestReleases(org, repoName, since);

    if (releases.length < 2) {
      return releases;
    }

    const releaseDiffs = await Promise.all(
      releases.slice(0, -1).map(async (release, i) => {
      const previousRelease = releases[i + 1];
      const diff = await this.getDiffBetweenTags(org, repoName, previousRelease.tag, release.tag);
      return { release, diff };
      })
    );

    return releaseDiffs;
  }
}

export default GitHubAPI;