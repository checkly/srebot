import 'dotenv/config';
import { queryGithubReleases, getOrgId } from './github';

// (async () => {
//   try {
//     const org = process.env.GITHUB_ORG_IT; // Replace with your GitHub organization
//     const releases = await queryGithubReleases(org);
//     console.log('GitHub Releases in the last 60 minutes:', releases);
//   } catch (error) {
//     console.error('Error:', error);
//   }
// })();

describe('GitHub API Tests', () => {
  it('should return the organization ID for checkly', async () => {
    const org = 'checkly';
    const orgId = await getOrgId(org);
    console.log(`Organization ID for ${org}:`, orgId);
    expect(orgId).toBeGreaterThan(0);
  });
});
