import * as fs from "node:fs";

import { initConfig } from "../../lib/init-config";

initConfig();

import { checkSummary } from "./check-summary";

const main = async () => {
  const checkId = "7017a27e-df7b-4501-a738-fa616782bc4e";
  const result = await checkSummary(checkId);
  fs.writeFileSync(`heatmap-${checkId}.png`, result.image);
  console.log(JSON.stringify(result.message, null, 2));
};

main();
