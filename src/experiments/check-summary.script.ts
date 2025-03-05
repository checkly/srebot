#!/usr/bin/env node_modules/.bin/ts-node

import { generateText } from "ai";
import { ChecklyClient } from "../checkly/checklyclient";
import { summarizeTestGoalPrompt } from "../prompts/checkly";

import dotenv from "dotenv";

// Load .env file from project root
dotenv.config({ path: "../../.env", override: true });

const CHECK_ID = "28f31eaf-3169-4a13-8f7d-f547c100805f";

const checkly = new ChecklyClient();

async function main() {
  const check = await checkly.getCheck(CHECK_ID, { includeDependencies: true });

  console.log(JSON.stringify(check, null, 2));

  const [prompt, config] = summarizeTestGoalPrompt(
    check.name,
    check.script || "",
    check.scriptPath || "",
    check.dependencies.map((d) => ({
      script: d.content,
      scriptPath: d.path,
    })),
  );

  const { text: summary } = await generateText({
    ...config,
    prompt,
  });

  console.log("Summary:", summary);
}

main();
