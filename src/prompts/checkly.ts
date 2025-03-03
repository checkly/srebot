import { stringify } from "yaml";
import { CheckContext, ContextKey } from "../aggregator/ContextAggregator";
import { Check } from "../checkly/models";
import { mapCheckToContextValue } from "../checkly/utils";
import { validObjectList, validObject } from "./validation";
import {
  definePrompt,
  promptConfig,
  PromptConfig,
  PromptDefinition,
} from "./common";
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

const SUMMARIZE_ERRORS_SCHEMA = z
  .object({
    groups: z
      .array(
        z.object({
          errorMessage: z
            .string()
            .describe(
              "The error message that occurred in this group of check results, max 100 characters",
            ),
          checkResults: z
            .array(z.string().describe("Check result ID"))
            .describe(
              "Array of check result IDs that share this error message",
            ),
        }),
      )
      .describe("Groups of check results that share the same error message"),
  })
  .describe("Analysis of check results grouped by their error messages");

export type SummarizeErrorsPromptType = z.infer<typeof SUMMARIZE_ERRORS_SCHEMA>;

export type CheckResult = {
  id: string;
  startedAt: string;
  attempts: number;
  resultType: string;
  sequenceId: string;
  location: string;
  error: string;
};

export function summarizeErrorsPrompt(input: {
  check: string;
  intervalStart: Date;
  intervalEnd: Date;
  locations: string[];
  frequency: number;
  results: Array<CheckResult>;
}): PromptDefinition {
  const prompt = `
    The following details describe a test which is used to monitor an application.

    Analyze the provided check results and group them by their error messages.
    For each error group, collect:
    - The error message pattern
    - The IDs of all check results that share this error message

    Check details:
    - name: ${input.check}
    - intervalStart: ${input.intervalStart.toISOString()}
    - intervalEnd: ${input.intervalEnd.toISOString()}
    - frequency: ${input.frequency}
    - locations: ${input.locations}

    Results:
    ${input.results
      .map(
        (result) => `
    - Result ID: ${result.id}
      Started at: ${result.startedAt}
      Attempt #: ${result.attempts}
      Result type: ${result.resultType}
      Sequence ID: ${result.sequenceId}
      Location: ${result.location}
      Error: ${result.error}
    `,
      )
      .join("\n")}
    `;

  return definePrompt("summarizeErrors", prompt, SUMMARIZE_ERRORS_SCHEMA, {
    temperature: 0.1,
    maxTokens: 10000,
  });
}

export function clusterCheckResults(
  checkDetails: {
    intervalStart: string;
    intervalEnd: string;
    locations: string[];
    frequency: number;
  },
  checkResults: CheckResult[],
  clusterFactor: number = 10,
) {
  const startDate = new Date(checkDetails.intervalStart);
  const endDate = new Date(checkDetails.intervalEnd);
  const timeClusters = Math.floor(
    (endDate.getTime() - startDate.getTime()) /
      (1000 * 60) /
      (checkDetails.frequency * 10),
  );

  // Create 2D array with dimensions [timeClusters][locations.length]
  const clusters: string[][][] = Array(timeClusters)
    .fill(null)
    .map(() => Array(checkDetails.locations.length).fill([]));

  // Place checks into appropriate clusters based on time and location
  checkResults.forEach((check) => {
    const checkTime = new Date(check.startedAt).getTime();
    const timeIndex = Math.floor(
      (checkTime - startDate.getTime()) /
        (1000 * 60 * checkDetails.frequency * clusterFactor),
    );
    const locationIndex = checkDetails.locations.indexOf(check.location);

    if (timeIndex >= 0 && timeIndex < timeClusters && locationIndex >= 0) {
      clusters[timeIndex][locationIndex] = [
        ...clusters[timeIndex][locationIndex],
        check.id,
      ];
    }
  });

  // Filter and flatten clusters into one-dimensional array with metadata
  const filteredClusters = clusters
    .flatMap((timeSlice, timeIndex) =>
      timeSlice.map((locationChecks, locationIndex) => ({
        timeIndex,
        location: checkDetails.locations[locationIndex],
        checks: locationChecks,
      })),
    )
    .filter((cluster) => cluster.checks.length > 0)
    .map((cluster) => {
      const clusterStartTime = new Date(
        startDate.getTime() +
          cluster.timeIndex *
            1000 *
            60 *
            checkDetails.frequency *
            clusterFactor,
      );
      const clusterEndTime = new Date(
        clusterStartTime.getTime() +
          1000 * 60 * checkDetails.frequency * clusterFactor,
      );

      return {
        location: cluster.location,
        checks: cluster.checks,
        startTime: clusterStartTime.toISOString(),
        endTime: clusterEndTime.toISOString(),
      };
    });

  return filteredClusters;
}

export function summarizeTestStepsPrompt(
  testName: string,
  scriptName: string,
  scriptPath: string,
  dependencies: { script: string; scriptPath: string }[],
  errors: string[],
): [string, PromptConfig] {
  return [
    `
      The following details describe a test which is used to monitor an application.

      Do not refer to technical details of the test, use the domain language from the application under test.
      Test name: ${testName}
      Script name: ${scriptName}
      Script: ${scriptPath}
      Error stack: ${errors}

      Dependent scripts of the main script:
      ${dependencies.map((d) => `- ${d.scriptPath}\n  ${d.script}`).join("\n")}

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
