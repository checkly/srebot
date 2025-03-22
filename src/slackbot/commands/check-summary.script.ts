import * as fs from "node:fs";

import { initConfig } from "../../lib/init-config";
import { checkSummary } from "./check-summary";

initConfig();

const main = async () => {
  const checkId = "13a60bda-0edc-470d-855e-7d092a1cca1c";
  const result = await checkSummary(checkId);
  console.log(JSON.stringify(result.message, null, 2));

  if (result.image) {
    fs.writeFileSync(`heatmap-${checkId}.png`, result.image);
  }
};

main();
