import { Octokit } from 'octokit';

class GitHubAPI {
  private octokit: Octokit;

  constructor(githubToken: string) {
    this.octokit = new Octokit({ auth: githubToken });
  }

  async queryLatestReleases(org: string): Promise<any> {
    try {
      const { data: repos } = await this.octokit.rest.repos.listForOrg({
        org,
        type: 'private',
      });

      const releases = await Promise.all(
        repos.map(async (repo: any) => {
          const { data: repoReleases } = await this.octokit.rest.repos.listReleases({
            owner: org,
            repo: repo.name,
          });
          let [latest, previous] = repoReleases.slice(0, 2);

          return { repo, latest, previous };
        })
      );

      return releases.filter(async (release: any) => {
        return release.latest && release.previous;
      });
    } catch (error) {
      console.error('Error querying GitHub releases:', error);
      throw error;
    }
  }

  async getOrgId(org: string): Promise<number> {
    try {
      const { data: organization } = await this.octokit.rest.orgs.get({
        org,
      });
      return organization.id;
    } catch (error) {
      console.error('Error fetching organization ID:', error);
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

  async getDiffBetweenTags(org: string, repo: string, baseTag: string, headTag: string): Promise<any> {
    try {
      const { data: diff } = await this.octokit.rest.repos.compareCommitsWithBasehead({
        owner: org,
        repo,
        basehead: `${baseTag}...${headTag}`,
      });
      return diff;
    } catch (error) {
      console.error('Error fetching diff between tags:', error);
      throw error;
    }
  }

  async queryLatestReleasesWithDiffs(org: string): Promise<any> {
    const releases = await this.queryLatestReleases(org);

    const releasesWithDiffs = await Promise.all(
      releases.map(async (releasesPerRepo: any) => {
        const { repo, latest, previous } = releasesPerRepo;
        const diff = await this.getDiffBetweenTags(org, repo.name, previous.tag_name, latest.tag_name);
        return { repo, latest, previous, diff };
      })
    );

    return releasesWithDiffs;
  }
}

export default GitHubAPI;