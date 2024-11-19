import 'dotenv/config';
import GitHubAPI from './github';

const CHECKLY_GITHUB_TOKEN = process.env.CHECKLY_GITHUB_TOKEN!;

describe('GitHub API Tests', () => {

  it('should return the latest releases for checkly', async () => {
    const githubAPI = new GitHubAPI(CHECKLY_GITHUB_TOKEN);
    const org = 'checkly';
    const repo = 'checkly-backend';

    const _24h_ago = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const releases = await githubAPI.queryLatestReleases(org, repo, _24h_ago);
    
    let diff = await githubAPI.getDiffBetweenTags(org, repo, releases[0].tag, releases[1].tag);
    expect(diff).toBeDefined();
  });

  it('should return the latest releases with diffs for checkly', async () => {
    const githubAPI = new GitHubAPI(CHECKLY_GITHUB_TOKEN);
    const org = 'checkly';
    const repo = 'checkly-backend';

    const _24h_ago = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const releasesWithDiffs = await githubAPI.queryLatestReleasesWithDiffs(org, repo, _24h_ago);
    expect(releasesWithDiffs).toBeDefined();
  });
});