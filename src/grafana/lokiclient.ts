export class LokiClient {
    private readonly lokiUrl: string;
    private readonly lokiApiKey: string;
    private readonly environment: string;
    user: string;
  
    //'sum by (level) (count_over_time({app=""}[1m]))';
    constructor(lokiUrl: string, lokiApiKey: string, user: string, environment: string) {
      this.lokiUrl = lokiUrl;
      this.lokiApiKey = lokiApiKey;
      this.environment = environment;
      this.user = user;
    }
  
    queryError(service: string): string {
      return `{app="${service}", env="${this.environment}"} |= "error"`;
    }
    getAvailableServices(): string[] {
      return [''];
    }
    async getErrorsForService(service: string,env: string, rangeMinutes: number) {
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
      url.searchParams.append('query', query);
      url.searchParams.append('start', start);
      url.searchParams.append('end', end);
      const authHeader = 'Basic ' + btoa(`${this.user}:${this.lokiApiKey}`);
  
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
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