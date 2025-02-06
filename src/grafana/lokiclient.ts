export class LokiClient {
  private readonly lokiUrl: string;
  private readonly lokiApiKey: string;
  private readonly environment: string;
  user: string;

  constructor(
    lokiUrl: string,
    lokiApiKey: string,
    user: string,
    environment: string,
  ) {
    this.lokiUrl = lokiUrl;
    this.lokiApiKey = lokiApiKey;
    this.environment = environment;
    this.user = user;
  }

  queryError(service: string): string {
    return `{app="${service}", env="${this.environment}"} |= "error"`;
  }

  async getLogCountByLevel(app: string, rangeMinutes: number): Promise<any> {
    const query = `sum by (detected_level) (count_over_time({app="${app}", env="${this.environment}"}[5m]))`;
    const end = new Date();
    const start = new Date(end.getTime() - rangeMinutes * 60 * 1000);
    const data = await this.queryLoki(
      query,
      start.toISOString(),
      end.toISOString(),
    );
    return data;
  }

  async getAllEnvironments(): Promise<string[]> {
    return this.getAllValuesForLabel("env");
  }

  async getAllApps(): Promise<string[]> {
    return this.getAllValuesForLabel("app");
  }

  /**
   * This function gets all available values for a label in Loki.
   * @returns
   */
  async getAllValuesForLabel(label: string): Promise<string[]> {
    const url = new URL(`${this.lokiUrl}/loki/api/v1/label/${label}/values`);
    const authHeader = "Basic " + btoa(`${this.user}:${this.lokiApiKey}`);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Error fetching available services: ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data.data; // Assuming the response structure is { "status": "success", "data": ["app1", "app2", ...] }
  }

  async getErrorsForService(service: string, rangeMinutes: number) {
    // Get the current time and subtract "rangeMinutes" minutes
    const end = new Date();
    const start = new Date(end.getTime() - rangeMinutes * 60 * 1000);

    // Convert to ISO string format
    const startISOString = start.toISOString();
    const endISOString = end.toISOString();
    const query = this.queryError(service);
    return this.queryLoki(query, startISOString, endISOString);
  }
  async queryLoki(query: string, start: string, end: string): Promise<any> {
    const url = new URL(`${this.lokiUrl}/loki/api/v1/query_range`);
    url.searchParams.append("query", query);
    url.searchParams.append("start", start);
    url.searchParams.append("end", end);
    const authHeader = "Basic " + btoa(`${this.user}:${this.lokiApiKey}`);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Error querying Loki: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }
    //https://grafana.com/docs/loki/latest/reference/loki-http-api/#query-logs-within-a-range-of-time
    return response.json();
  }
}
