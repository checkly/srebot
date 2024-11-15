import 'dotenv/config';
import GitHubAPI from './github';

const githubToken = process.env.GITHUB_TOKEN!;

describe('GitHub API Tests', () => {
  it('should return the organization ID for checkly', async () => {
    const githubAPI = new GitHubAPI(githubToken);
    const org = 'checkly';

    const orgId = await githubAPI.getOrgId(org);
    expect(orgId).toBe(25982255);
  });

  it('should return the latest releases for checkly', async () => {
    const githubAPI = new GitHubAPI(githubToken);
    const org = 'checkly';

    const releases = await githubAPI.queryLatestReleases(org);
    console.log(JSON.stringify(releases, null, 2));

    releases.forEach(async (releasesPerRepo) => {
      const { repo, latest, previous } = releasesPerRepo;
      
      let diff = await githubAPI.getDiffBetweenTags(org, repo.name, latest.tag_name, previous.tag_name);

      console.log(JSON.stringify({repo, latest, previous, diff}, null, 2));
    });
  });

  it('should return the latest releases with diffs for checkly', async () => {
    const githubAPI = new GitHubAPI(githubToken);
    const org = 'checkly';

    const releasesWithDiffs = await githubAPI.queryLatestReleasesWithDiffs(org);
    console.log(JSON.stringify(releasesWithDiffs, null, 2));
    expect(releasesWithDiffs).toBeDefined();
  });
});
