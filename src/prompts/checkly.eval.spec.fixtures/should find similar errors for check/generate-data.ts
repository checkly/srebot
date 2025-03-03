import { ChecklyClient } from "../../../checkly/checklyclient";
import fs from "fs";

const groupId = 394650;

async function main() {
  const client = new ChecklyClient();
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
  for (const check of filteredChecks) {
    const checkDir = `${baseDir}/checks/${check.id}`;
    fs.mkdirSync(checkDir, { recursive: true });

    fs.writeFileSync(`${checkDir}/check.json`, JSON.stringify(check, null, 2));

    // Get failed results from last 30 days
    const resultSummary = new Array();
    const results = await client.getCheckResultsByCheckId(check.id, {
      hasFailures: true,
      resultType: "ALL",
      fromMs: intervalStart,
      toMs: intervalEnd,
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
}

main();
