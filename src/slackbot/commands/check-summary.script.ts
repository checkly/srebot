import * as fs from "node:fs";

import { initConfig } from "../../lib/init-config";
import { checkSummary } from "./check-summary";

initConfig();

const main = async () => {
  const checkId = process.argv[2] || "97660b50-da30-46fa-bf39-8191c89aa1c7";

  console.log("Fetching check summary for", checkId);
  const result = await checkSummary(checkId);
  console.log(JSON.stringify(result.message, null, 2));
  process.exit(0);
};

main();
