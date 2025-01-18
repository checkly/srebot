import { GrafanaClient } from './grafanaclient';
import 'dotenv/config';

const grafanaApiKey = process.env.GRAFANA_API_KEY!;
const user = process.env.GRAFANA_USER!;
const grafanaUrl = "https://checklyhq.grafana.net";
const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
const maybe = !isGithubActions ? describe : describe.skip;

jest.setTimeout(30000);

maybe('GrafanaClient', () => {
  let grafanaClient: GrafanaClient;

  beforeAll(() => {
    grafanaClient = new GrafanaClient(grafanaUrl, grafanaApiKey, user);
  });

  it('should get dashboards', async () => {
    const dashboards = await grafanaClient.getDashboards();
    expect(dashboards).toBeDefined();
    
    expect(Array.isArray(dashboards)).toBe(true);

    const db = 'Runners Overview'
    const dashboard = await grafanaClient.getDashboardUrlByName(db);
    expect(dashboard).toBeDefined();
    
    // Add more assertions based on the expected structure of the dashboards
  });

  // Add more tests for other methods if needed
});