import { stringify } from "yaml";
import { CheckContext, ContextKey } from "../aggregator/ContextAggregator";
import { Check } from "../checkly/models";
import { mapCheckToContextValue } from "../checkly/utils";
import { promptConfig, PromptConfig } from "./common";
import { slackFormatInstructions } from "./slack";

/** Maximum length for context analysis text to prevent oversized prompts */

const CONTEXT_ANALYSIS_MAX_LENGTH = 200000;

/**
 * Generates a prompt for analyzing a single context entry when a check fails.
 * The prompt includes the check data and the specific entry's context for analysis.
 *
 * @param {CheckContext} entry - The specific context entry to analyze
 * @param {CheckContext[]} allEntries - All available context entries for the check
 * @returns {string} A formatted prompt string for analyzing the context entry
 *
 * @example
 * const prompt = contextAnalysisEntryPrompt(entry, allContextEntries);
 */
export function contextAnalysisEntryPrompt(
  entry: CheckContext,
  allEntries: CheckContext[],
): [string, PromptConfig] {
  return [
    `The following check has failed: ${formatChecklyMonitorData(allEntries)}

		Analyze the following context and generate a concise summary to extract the most important information. Output only the relevant context summary, no other text.

CONTEXT:
${stringify(entry)}`,
    promptConfig({ temperature: 0.1, maxTokens: 300 }),
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
): [string, PromptConfig] {
  const checkContext = formatChecklyMonitorData(contextRows);

  return [
    `The following check has changed its state: ${checkContext}

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

Check-results amd checkly configuration details are already provided in the UI. Focus on the root cause analysis and potential mitigations. Help the user to resolve the issue.
Generate a condensed summary of your root cause analysis of the current situation.
Focus on the essentials, provide a concise overview and actionable insights.
Provide reasoning and the source of the information. Max. 100 words. Include links to relevant context if applicable.
Be concise, insightful and actionable, skip the fluff, no yapping.
If a recent release is the most likely root cause, provide a link to the release diff.

*Summary:*`,
    promptConfig({
      temperature: 1,
      maxTokens: 500,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "contextAnalysisSummary",
      },
    }),
  ];
}

export function checklyToolPrompt(
  checks: Check[],
  query: string | undefined,
): [string, PromptConfig] {
  return [
    `You are the Checkly Check Search Engine. You are given a query and a list of checks. Return the most relevant check that relates to the query.

Available checks: ${stringify(checks.map((c) => ({ ...mapCheckToContextValue(c) })))}

Search Query: ${query ?? ""}`,
    promptConfig(),
  ];
}

/**
 * Formats context data for analysis by filtering out Checkly check data and
 * converting the remaining context to YAML format. The output is truncated
 * to prevent oversized prompts.
 *
 * @param {CheckContext[]} rows - Array of context entries to format
 * @returns {string} YAML formatted string of filtered context data
 *
 * @example
 * const formattedContext = formatContextAnalysis(contextRows);
 */
function formatContextAnalysis(rows: CheckContext[]): string {
  return stringify(
    rows
      .filter((c) => c.key !== ContextKey.ChecklyCheck)
      .map((c) => ({ key: c.key, source: c.source, value: c.value })),
    { indent: 2 },
  ).slice(0, CONTEXT_ANALYSIS_MAX_LENGTH);
}

/**
 * Extracts and formats Checkly monitor data from context entries.
 * Finds the Checkly check context and formats it as YAML with check ID and value.
 *
 * @param {CheckContext[]} rows - Array of context entries to search for Checkly data
 * @returns {string} YAML formatted string of Checkly monitor data
 *
 * @example
 * const monitorData = formatChecklyMonitorData(contextRows);
 */
function formatChecklyMonitorData(rows: CheckContext[]): string {
  const checkContext = rows.find((c) => c.key === ContextKey.ChecklyCheck);
  return stringify(
    {
      checkId: checkContext?.checkId,
      data: checkContext?.value,
    },
    { indent: 2 },
  );
}
