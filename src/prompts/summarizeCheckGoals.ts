import { Check } from "../checkly/models";
import { CheckTable } from "../db/check";
import { formatMultipleChecks } from "./checkly";
import { promptConfig, PromptDefinitionForText } from "./common";

export function summariseMultipleChecksGoal(
  checks: Check[] | CheckTable[],
  options: { maxTokens: number; extraContext?: string | null } = {
    maxTokens: 200,
    extraContext: null,
  },
): PromptDefinitionForText {
  const checksFormatted = formatMultipleChecks(checks);
  const maxTokens = options.maxTokens;

  let prompt = `
### **Task**
You are an expert SRE engineer. Analyze the following monitoring checks and provide a **high-level summary** of their **common goal** for another engineer.
The target engineer is likely in an incident situation and needs to understand the purpose of the checks to resolve the issue.

### **Instructions**
1. Identify what user-facing feature(s) these checks are monitoring.
2. Do **not** focus on technical details (e.g., URLs, assertions, scripts).
3. Prioritize accuracy and clarity in your response.
4. Provide a concise but meaningful summary in **natural language**.
5. Take into account the url/name of the service that is being monitored. Output it if possible
6. The obvious goals of the checks is to monitor functionality and reliability of services - do not focus on this, focus on WHAT is monitored.

### **Checks Data**
${checksFormatted}

### **Expected Output**
Provide a **brief summary** explaining the **common purpose** of these checks, focusing on the user impact rather than implementation details.
Answer in no more than 250 characters.
    `;

  if (options.extraContext) {
    prompt += `
    ADDITIONAL CONTEXT EXPLAINING CHECKLY ACCOUNT SETUP:
    ${options.extraContext}
    `;
  }
  return {
    prompt: prompt,
    ...promptConfig("summariseMultipleChecksGoal", {
      temperature: 1,
      maxTokens: maxTokens,
    }),
  };
}
