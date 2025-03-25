import * as fs from "node:fs";

import { initConfig } from "../../lib/init-config";
import { checkSummary } from "./check-summary";

initConfig();

const main = async () => {
  const checkId = process.argv[2] || "48325fbe-2d06-42a9-8a63-71d0ca27b080";

  console.log("Fetching check summary for", checkId);
  const result = await checkSummary(checkId);
  console.log(JSON.stringify(result.message, null, 2));
  process.exit(0);
};

main();
