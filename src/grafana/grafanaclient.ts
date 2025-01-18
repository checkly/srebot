export class GrafanaClient {
    private readonly grafanaUrl: string;
    private readonly grafanaApiKey: string;

    constructor(grafanaUrl: string, grafanaApiKey: string) {
      this.grafanaUrl = grafanaUrl;
      this.grafanaApiKey = grafanaApiKey;
    }

   async getDashboardUrlByName(dashboardName: string): Promise<string> {
    const dashboards = await this.getDashboards();
    const runners = dashboards.filter(d=>d.type==='dash-db' ).filter(d=>d.title.toLowerCase().includes(dashboardName.toLowerCase()))[0]
    return runners.url
   }

    async getDashboards(): Promise<any[]> {
        const url = `${this.grafanaUrl}/api/search`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.grafanaApiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Error fetching dashboards: ${response.statusText}`);
    }

    return response.json();
    }
}