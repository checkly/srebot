import * as fs from "node:fs";

import { initConfig } from "../../lib/init-config";
import { checkSummary } from "./check-summary";

initConfig();

const main = async () => {
  const checkId = process.argv[2] || "50396dfc-22c2-4ee4-9613-a8fb16bdde49";

  console.log("Fetching check summary for", checkId);
  const result = await checkSummary(checkId);
  console.log(JSON.stringify(result.message, null, 2));
  process.exit(0);
};

main();
