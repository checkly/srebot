import { stringify } from "yaml";
import { CheckContext, ContextKey } from "../aggregator/ContextAggregator";
import { Check } from "../checkly/models";
import { mapCheckToContextValue } from "../checkly/utils";
import { validObjectList, validObject } from "./validation";
import { definePrompt, PromptDefinition } from "./common";
import { slackFormatInstructions } from "./slack";
import { z } from "zod";

/** Maximum length for context analysis text to prevent oversized prompts */
const CONTEXT_ANALYSIS_MAX_LENGTH = 200000;

export function contextAnalysisEntryPrompt(
  entry: CheckContext,
  allEntries: CheckContext[],
): PromptDefinition {
  validObject.parse(entry);
  validObjectList.parse(allEntries);

  const checklyCtx = findChecklyContext(allEntries, ContextKey.ChecklyCheck);
  validObject.parse(checklyCtx);

  const checklyScript = findChecklyContext(
    allEntries,
    ContextKey.ChecklyScript,
  );
  validObject.parse(checklyScript);

  const prompt = `The following check has failed: ${formatChecklyMonitorData(checklyCtx as CheckContext)}

    Here's the checkly script for this check:
    ${checklyScript}

    Analyze the following context and generate a concise summary to extract the most important information. Output only the relevant context summary, no other text.

CONTEXT:
${stringify(entry)}`;

  const schema = z.object({
    summary: z.string().describe("Concise summary of the analyzed context"),
  });

  return definePrompt("contextAnalysisEntry", prompt, schema, {
    temperature: 0.1,
    maxTokens: 300,
  });
}

export function featureCoveragePrompt(
  testName: string,
  scriptName: string,
  script: string,
  errors: string[],
): [string, PromptConfig] {
  return [
    `
      The following details describe a test which is used to monitor an application.

      Do not refer to technical details of the test, use the domain language from the application under test.
      Test name: ${testName}
      Script name: ${scriptName}
      Script: ${script}
      Error stack: ${errors}

      Summarize the steps executed by the test using high level domain language. Focus on the user flow omit technical details. Use max 5 words per step.
      Identify the step which failed by match the script code with the stack of the error. Include details about the test failure.

      CONSTITUTION:
      - Always prioritize accuracy and relevance in the summary
      - Be concise but comprehensive in your explanations
      - Focus on providing actionable information that can help judging user impact
    `,
    promptConfig("checklySummarizeFeatureCoverage", {
      temperature: 1,
      maxTokens: 500,
    }),
  ];
}

/**
 * Generates a comprehensive analysis prompt for multiple context entries.
 * Creates a structured prompt for analyzing check state changes and generating
 * actionable insights for DevOps engineers. The prompt includes specific
 * instructions for format, analysis approach, and output requirements.
 *
 * @param {CheckContext[]} contextRows - Array of context entries to analyze
 * @returns {string} A formatted prompt string for comprehensive context analysis
 *
 * @example
 * const summary = contextAnalysisSummaryPrompt(contextEntries);
 */
export function contextAnalysisSummaryPrompt(
  contextRows: CheckContext[],
): PromptDefinition {
  validObjectList.parse(contextRows);

  const checklyCtx = findChecklyContext(contextRows, ContextKey.ChecklyCheck);
  validObject.parse(checklyCtx);

  const checklyScript = findChecklyContext(
    contextRows,
    ContextKey.ChecklyScript,
  );
  validObject.parse(checklyScript);

  const checkContext = formatChecklyMonitorData(checklyCtx as CheckContext);

  const prompt = `The following check has changed its state: ${checkContext}

Anaylze the following context and generate a concise summary of the current situation.

CONSTITUTION:
- Always prioritize accuracy and relevance in your insights and recommendations
- Be concise but comprehensive in your explanations
- Focus on providing actionable information that can help reduce MTTR
- The user is a experienced devops engineer. Don't overcomplicate it, focus on the context and provide actionable insights. They know what they are doing, don't worry about the details.
- Don't include the check configuration or run details, focus on logs, changes and the current state of the system.
- Knowledge context is provided for you to build better understanding of the product, system and organisation structures.

OUTPUT FORMAT INSTRUCTIONS:
${slackFormatInstructions}

CONTEXT:
${formatContextAnalysis(contextRows)}

Check-results and checkly configuration details are already provided in the UI. Focus on the root cause analysis and potential mitigations. Help the user to resolve the issue.
Generate a condensed summary of your root cause analysis of the current situation.
Focus on the essentials, provide a concise overview and actionable insights.
Provide reasoning and the source of the information. Max. 100 words. Include links to relevant context if applicable.
Be concise, insightful and actionable, skip the fluff, no yapping.
If a recent release is the most likely root cause, provide a link to the release diff.

*Summary:*`;

  const schema = z.object({
    summary: z.string().describe("Root cause analysis and actionable insights"),
    links: z.array(z.string()).optional().describe("Relevant context links"),
  });

  return definePrompt("contextAnalysisSummary", prompt, schema, {
    temperature: 1,
    maxTokens: 500,
  });
}

export function checklyToolPrompt(
  checks: Check[],
  query: string | undefined,
): PromptDefinition {
  validObjectList.parse(checks);

  const prompt = `You are the Checkly Check Search Engine. You are given a query and a list of checks. Return the most relevant check that relates to the query.

Available checks: ${stringify(checks.map((c) => ({ ...mapCheckToContextValue(c) })))}

Search Query: ${query ?? ""}`;

  const schema = z.object({
    checkName: z.string(),
    checkId: z.string(),
  });

  return definePrompt("checklyTool", prompt, schema);
}

// Helper functions remain unchanged
function formatContextAnalysis(rows: CheckContext[]): string {
  validObjectList.parse(rows);

  return stringify(
    rows
      .filter((c) => c.key !== ContextKey.ChecklyCheck)
      .map((c) => ({ key: c.key, source: c.source, value: c.value })),
    { indent: 2 },
  ).slice(0, CONTEXT_ANALYSIS_MAX_LENGTH);
}

function formatChecklyMonitorData(ctx: CheckContext): string {
  validObject.parse(ctx);

  return stringify(
    {
      checkId: ctx.checkId,
      data: ctx.value,
    },
    { indent: 2 },
  );
}

function findChecklyContext(
  allRows: CheckContext[],
  key: ContextKey,
): CheckContext | undefined {
  return allRows.find((c) => c.key === key);
}
