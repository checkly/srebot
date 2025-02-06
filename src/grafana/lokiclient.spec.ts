import { LokiClient } from "./lokiclient";
import "dotenv/config";
const lokiApiKey = process.env.LOKI_API_KEY!;
const user = process.env.LOKI_USER!;
const lokiUrl = process.env.LOKI_URL!;
const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const maybe = !isGithubActions ? describe : describe.skip;
jest.setTimeout(30000);
maybe("LokiClient", () => {
  let lokiClient: LokiClient;

  beforeAll(() => {
    lokiClient = new LokiClient(lokiUrl, lokiApiKey, user, "staging");
  });

  it("can count logs by level for a service", async () => {
    const service = "checkly-api";
    const rangeMinutes = 60 * 12;
    const data = await lokiClient.getLogCountByLevel(service, rangeMinutes);
    expect(data).toBeDefined();
    console.log(JSON.stringify(data.data.result));
    expect(data).toHaveProperty("data");
    //console.log(JSON.stringify(data.data.result[0].values));
  });

  it("should get available services", async () => {
    const services = await lokiClient.getAllValuesForLabel("app");
    expect(services).toBeDefined();
    expect(services.length).toBeGreaterThan(0);
    //console.log(services);
  });

  it("should run a query and return results", async () => {
    const services = lokiClient.getAllValuesForLabel("app");
    const data = await lokiClient.getErrorsForService(services[1], 10);
    expect(data).toBeDefined();
    expect(data).toHaveProperty("data");
    //console.log(JSON.stringify(data.data.result[0].values));
  });
});
