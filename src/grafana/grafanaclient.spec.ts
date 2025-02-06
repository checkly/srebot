import { GrafanaClient } from "./grafanaclient";
import "dotenv/config";

const grafanaApiKey = process.env.GRAFANA_API_KEY!;
const grafanaUrl = process.env.GRAFANA_INSTANCE_URL!;
const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const maybe = !isGithubActions ? describe : describe.skip;

maybe("GrafanaClient", () => {
  let grafanaClient: GrafanaClient;

  beforeAll(() => {
    grafanaClient = new GrafanaClient(grafanaUrl, grafanaApiKey);
  });

  it("should get dashboards", async () => {
    const dashboards = await grafanaClient.getDashboards();
    expect(dashboards).toBeDefined();

    expect(Array.isArray(dashboards)).toBe(true);

    const db = "Runners Overview";
    const dashboard = await grafanaClient.getDashboardUrlByName(db);
    expect(dashboard).toBeDefined();
  });
});
