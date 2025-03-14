import { ChecklyClient } from "./checklyclient";
import "dotenv/config";
import * as fs from "fs";

jest.setTimeout(30000);
describe("ChecklyService", () => {
  const client: ChecklyClient = new ChecklyClient();

  beforeEach(async () => {});

  it("can download all checks", async () => {
    const result = await client.getChecks();
    expect(result).toBeDefined();
    const activated = result.filter((r) => r.activated);
    expect(activated).toBeDefined();
  });

  it("can download all check groups", async () => {
    const groups = await client.getCheckGroups();
    expect(groups).toBeDefined();
  });

  it("can find activated checks", async () => {
    const result = await client.getActivatedChecks();
    expect(result).toBeDefined();
  });

  it("get failed results", async () => {
    const s = await client.getActivatedChecks();
    const result = await client.getCheckResults(s[1].id, true, 100);

    //console.log(JSON.stringify(result));
    expect(result).toBeDefined();
  });

  it("should be defined", async () => {
    const checks = await client.getChecks();
    const check = checks.find((c) => c.checkType == "BROWSER");

    const result = await client.getCheck(check!.id, {
      includeDependencies: true,
    });
    console.log(JSON.stringify(result, null, 2));
    expect(result).toBeDefined();
  });

  it("can download prometheus metrics", async () => {
    const result = await client.getPrometheusCheckStatus();
    expect(result).toBeDefined();
  });

  it("can retrieve check metrics", async () => {
    const result = await client.getCheckMetrics("BROWSER");

    expect(result).toBeDefined();
  });

  it("can retrieve check statuses", async () => {
    const result = await client.getStatuses();

    expect(result).toBeDefined();
  });

  it.skip("can retrieve account", async () => {
    const result = await client.getAccount(
      "04fec768-8ac4-4a9c-ae72-5522045772f5",
    );

    expect(result).toBeDefined();
  });

  it("can retrieve dashboards", async () => {
    const result = await client.getDashboards();

    expect(result).toBeDefined();
  });

  it("can retrieve dashboard by id", async () => {
    const id = "77b9895d";
    const result = await client.getDashboard(id);

    expect(result).toBeDefined();
  });

  it.skip("can run a check", async () => {
    const result = await client.runCheck(
      "e7608d1a-c013-4194-9da0-dec05d2fbabc",
    );

    expect(result).toBeDefined();
  });

  it("can retrieve reportings", async () => {
    const result = await client.getReporting();

    expect(result).toBeDefined();
  });

  it("can merge checks and groups", async () => {
    const result = await client.getPrometheusCheckStatus();

    const failingSummary = Object.entries(
      result.failing.reduce(
        (acc, curr) => {
          if (!acc[curr.labels.group]) {
            acc[curr.labels.group] = [];
          }

          acc[curr.labels.group].push(curr.labels.name);

          return acc;
        },
        {} as Record<string, string[]>,
      ),
    ).reduce((acc, [group, tests]) => {
      return (
        acc +
        "  " +
        group +
        "\n" +
        tests.reduce((acc, curr) => acc + "     " + curr + "\n", "")
      );
    }, "Failing tests:\n");

    expect(result).toBeDefined();
  });
});
