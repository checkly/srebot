import * as fs from "node:fs";

import { initConfig } from "../../lib/init-config";
import { checkSummary } from "./check-summary";

initConfig();

const main = async () => {
  const checkId = process.argv[2] || "cd4fd89a-40a6-41be-8012-5034f0c40ff6";

  console.log("Fetching check summary for", checkId);
  const result = await checkSummary(checkId);
  console.log(JSON.stringify(result.message, null, 2));

  if (result.image) {
    const path = `/tmp/heatmap-${checkId}.png`;
    fs.writeFileSync(path, result.image);
    console.log("Heatmap image saved to", path);
    console.log(`file://${path}`);
  }
  process.exit(0);
};

main();
