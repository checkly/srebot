import { Octokit } from '@octokit/rest';

export async function queryGithubReleases(org: string): Promise<any> {
    const githubToken = process.env.GITHUB_TOKEN;
    const octokit = new Octokit({ auth: githubToken });
    const now = new Date();
    const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  
    try {
      const { data: repos } = await octokit.repos.listForOrg({
        org,
        type: 'all',
      });
  
      const releases = await Promise.all(
        repos.map(async (repo) => {
          const { data: repoReleases } = await octokit.repos.listReleases({
            owner: org,
            repo: repo.name,
            per_page: 100,
          });
          return repoReleases.filter((release) => release.published_at && new Date(release.published_at) > new Date(since));
        })
      );
  
      return releases.flat();
    } catch (error) {
      console.error('Error querying GitHub releases:', error);
      throw error;
    }
  }

export async function getOrgId(org: string): Promise<number> {
  const githubToken = process.env.GITHUB_TOKEN;
  const octokit = new Octokit({ auth: githubToken });

  try {
    const { data: organization } = await octokit.orgs.get({
      org,
    });
    return organization.id;
  } catch (error) {
    console.error('Error fetching organization ID:', error);
    throw error;
  }
}