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
          console.log(acc);
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

    console.log(`
Passing: ${result.passing.length}
Failing: ${result.failing.length}
Degraded: ${result.degraded.length}

${failingSummary}
    `);

    expect(result).toBeDefined();
  });

  it.skip("get check results for group", async () => {
    const groupId = 394650;
    let checks = await client.getChecksByGroup(groupId);

    const intervalStart = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const intervalEnd = Date.now();

    // Create base directory for this group
    const baseDir = `results/groups/${groupId}`;
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    } else {
      fs.rmSync(baseDir, { recursive: true, force: true });
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const filteredChecks = checks;
    // const filteredChecks = [{ id: "28f31eaf-3169-4a13-8f7d-f547c100805f" }];
    // Fetch results for each check
    for (const check of filteredChecks) {
      const checkDir = `${baseDir}/checks/${check.id}`;
      fs.mkdirSync(checkDir, { recursive: true });

      fs.writeFileSync(
        `${checkDir}/check.json`,
        JSON.stringify(check, null, 2),
      );

      // Get failed results from last 30 days
      const resultSummary = new Array();
      const results = await client.getCheckResultsByCheckId(check.id, {
        hasFailures: true,
        resultType: "ALL",
        from: intervalStart,
        to: intervalEnd,
        limit: 100,
      });
      console.log("RESULTS", results.length);
      if (results.length == 0) {
        console.log("No results found for check", check.id);
        continue;
      }

      // Create results directory for this check
      const resultsDir = `${checkDir}/results`;
      fs.mkdirSync(resultsDir, { recursive: true });

      // Store each result in a separate file
      for (const result of results) {
        const resultPath = `${checkDir}/results/${result.id}.json`;
        fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
        resultSummary.push({
          id: result.id,
          sequenceId: result.sequenceId,
          resultType: result.resultType,
          startedAt: result.startedAt,
          location: result.runLocation,
          attempts: result.attempts,
          error: result.browserCheckResult?.errors[0],
        });
      }

      fs.writeFileSync(
        `${checkDir}/result-summary.json`,
        JSON.stringify(
          {
            check: check.name,
            intervalStart,
            intervalEnd,
            frequency: check.frequency,
            locations: check.locations,
            results: resultSummary,
          },
          null,
          2,
        ),
      );
    }

    expect(checks).toBeDefined();
    expect(checks.length).toBe(15);
  }, 3000000); // Added 300 second timeout
});
