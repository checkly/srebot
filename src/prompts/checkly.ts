import { stringify } from "yaml";
import { CheckContext, ContextKey } from "../aggregator/ContextAggregator";
import { Check } from "../checkly/models";
import { mapCheckToContextValue } from "../checkly/utils";
import { validObject, validObjectList } from "./validation";
import {
  defineMessagesPrompt,
  definePrompt,
  promptConfig,
  PromptConfig,
  PromptDefinition,
  PromptDefinitionForText,
} from "./common";
import { slackFormatInstructions } from "./slack";
import { z } from "zod";
import { CoreMessage, CoreSystemMessage, CoreUserMessage } from "ai";
import { log } from "../log";
import { CheckTable } from "../db/check";

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
  interval: { from: Date; to: Date };
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
    - intervalStart: ${input.interval.from.toISOString()}
    - intervalEnd: ${input.interval.to.toISOString()}
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

enum CheckSeverity {
  PASSING = "PASSING",
  DEGRADED = "DEGRADED",
  FAILING = "FAILING",
  NEW_FAILING = "NEW_FAILING",
  NEW_DEGRADED = "NEW_DEGRADED",
  RECOVERED = "RECOVERED",
}

type CheckStatus = {
  checkId: string;
  runLocation: string;
  changePoints: {
    timestamp: number;
    formattedTimestamp: string;
    severity: string;
  }[];
};

export function summarizeMultipleChecksStatus(
  checks: CheckStatus[],
  currentDate: Date = new Date(),
): PromptDefinitionForText {
  const prompt = `
    The following json data describes the state of multiple monitoring checks in different locations.
    ${checks
      .map(
        (check) => `
      - checkId: ${check.checkId}
      - runLocation: ${check.runLocation}
      - changePoints: ${check.changePoints
        .map(
          (cp) =>
            `- timestamp: ${cp.timestamp} formattedTimestamp: ${cp.formattedTimestamp} severity: ${cp.severity}`,
        )
        .join("\n")}
    `,
      )
      .join("\n")}

    Current time: ${currentDate.toLocaleString()}

    Explanation of the data:
    - checkId: The ID of the check (do not mention in the summary, rather call out the number of affected checks)
    - runLocation: The location of the check (this can be used in the summary to indicate the affected locations)
    - severity: The severity of the check (do not use the enum values but rather use words describing there meaning)
    - patternStart: unix timestamp at which the severity changed from one state to another, render this in time ago format

    Be an SRE Engineer which answers the question what the state of the current checks is. Use max 100 characters.

    Constitution:
    - Always prioritize accuracy and relevance in the summary
    - Be concise but comprehensive in your explanations
    - Prioritize ${CheckSeverity.NEW_FAILING} > ${CheckSeverity.NEW_DEGRADED} > ${CheckSeverity.RECOVERED}
    - do not include any call for actions, just describe the current state
  `;

  return {
    prompt,
    ...promptConfig("summarizeMultipleChecksStatus", {
      temperature: 0.1,
      maxTokens: 1000,
    }),
  };
}

export function summarizeTestGoalPrompt(
  check: Check | CheckTable,
  extraContext: string | null = null,
): PromptDefinitionForText {
  let prompt = `The following details describe a test which is used to monitor an application.

      CHECK DATA:
      ${formatMultipleChecks([check] as Check[] | CheckTable[])}

      Summarize what the test is validating in a single sentence with max 10 words.

      CONSTITUTION:
      - Always prioritize accuracy and relevance in the summary
      - Be concise but comprehensive in your explanations
      - Focus on providing actionable information that can help judging user impact
      - Do not refer to technical details of the test, use the domain language from the application under test.
    `;

  if (extraContext) {
    prompt += `

    ADDITIONAL CONTEXT EXPLAINING CHECKLY ACCOUNT SETUP:
    ${extraContext}
    `;
  }

  return {
    prompt,
    ...promptConfig("summarizeTestGoalPrompt", {
      temperature: 0,
      maxTokens: 500,
    }),
  };
}

export enum SimpleErrorCategory {
  PASSING = "PASSING",
  FLAKY = "FLAKY",
  FAILING = "FAILING",
}

export function analyseCheckFailureHeatMap(heatmap: Buffer): PromptDefinition {
  const messages = [
    {
      role: "system",
      content: `
        You are an AI specialized in analyzing heatmaps representing check failure ratios over time across multiple regions.

        ### **Heatmap Details:**
        - The heatmap displays the ratio of check failures per region over 30-minute intervals.
        - 24-hour heatmaps displaying check-failure percentages (from 0% to 100%) over time for one or more regions.
        - Gray zones on the heatmap represent periods with no check runs, which is entirely expected and should not be treated as failures.
        - A legend on the right shows a color scale from green (0%) at the bottom to red (100%) at the top, indicating the failure percentage
        - The X-axis represents time in UTC, with the most recent timestamp on the right.
        - The Y-axis represents different geographic regions.

        ### **Categorization Task:**
        Your goal is to classify the check results as PASSING, FLAKY, or FAILING.

        **Categories and Decision Process:**
        1. **PASSING** → The check has minimal or no failures in the past 24 hours.
        2. **FLAKY** → Failures appear sporadically, without a clear pattern, affecting different times and locations inconsistently.
        3. **FAILING** → There are one or more distinct failure incidents in specific timeframes/locations, OR failures are **still occurring at the latest timestamp**.

        ### **Step-by-Step Chain of Thought Analysis (CoT)**
        To ensure a reliable classification, analyze the heatmap in the following order:

        **1. Identify major failure patterns.**
           - Are failures isolated and random? (**FLAKY**)
           - Are failures concentrated in specific time windows? (**FAILING**)
           - Is the heatmap mostly green? (**PASSING**)

        **2. Consider the latest timestamp.**
           - If failures exist at the latest timestamp, it suggests an **ongoing issue** (**FAILING**).
           - Mention that the issue is ongoing if there is no newer data after the most recent failure.

        **3. Summarize your findings.**
           - Clearly describe the affected locations and timeframes.
           - Focus solely on visible data: which regions failed, roughly when, and whether they recovered
        `,
    } as CoreSystemMessage,
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Analyze this heatmap and classify the check as PASSING, FLAKY, or FAILING. Explain whether failures are isolated, clustered in specific timeframes, or still ongoing.",
        },
        {
          type: "image",
          image: `data:image/jpeg;base64,${heatmap.toString("base64")}`,
        },
      ],
    } as CoreUserMessage,
  ];

  const schema = z.object({
    category: z
      .nativeEnum(SimpleErrorCategory)
      .describe(
        'You must choose exactly one of ["PASSING", "FLAKY", "FAILING"]. If you see no failures at any time, pick PASSING. If failures occur but are resolved by the last timestamp, pick FLAKY. If any region still fails at the final timestamp or has continuous failures, pick FAILING',
      ),

    failureIncidentsSummary: z.string().describe(
      `Brief summary of the failure incidents, with their time-frame.
         For each incident mention if it affected all locations, or a subset.
         Use only hours for times, and full locations names.
         If there is no clear pattern (sporadic or random failures)- do not mention specific times or locations.
         If the failures are still happening, mention it. Use 2 sentences max.`,
    ),
  });

  return defineMessagesPrompt("analyseCheckFailureHeatMap", messages, schema, {
    temperature: 0,
    maxTokens: 1000,
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

type SummariseCheckInput = {
  name: string;
  tags: string[];
  groupName?: string;
  checkType: string;
  dependencies: { path: string; content: string }[];
  locations: string[];
  request?: {
    method: string;
    url: string;
    assertions: string[];
  };
};

export const formatMultipleChecks = (
  checks: Check[] | CheckTable[],
  characterLimit = 100_000,
): string => {
  const checkInputs: SummariseCheckInput[] = checks.map((check) => {
    const dependencies: { content: string; path: string }[] = [];

    if (check.script) {
      dependencies.push({
        content: check.script,
        path: check.scriptPath,
      });
    }

    if (check.localSetupScript) {
      dependencies.push({
        path: "localSetupScript",
        content: check.localSetupScript,
      });
    }
    if (check.localTearDownScript) {
      dependencies.push({
        path: "localTearDownScript",
        content: check.localTearDownScript,
      });
    }

    dependencies.push(...check.dependencies);

    return {
      name: check.name,
      tags: check.tags,
      groupName: check.group?.name,
      checkType: check.checkType,
      request: check.request,
      locations: check.locations,
      dependencies,
    };
  });

  const describeCheck = (check) => `
- Name: ${check.name}
- Group: ${check.groupName}
- Type: ${check.checkType}
- Tags: ${check.tags.join(", ") || "None"}
- Locations: ${check.locations.join(", ")}
${
  check.request
    ? `- Request: [${check.request.method}] ${check.request.url}\n  - Assertions: ${check.request.assertions?.join(
        ", ",
      )}`
    : ""
}
- Dependencies:
${
  check.dependencies.length
    ? check.dependencies
        .map((d) => `\`\`\`\n#${d.path}\n  ${d.content}\`\`\``)
        .join("\n")
    : "None"
}
`;

  // Keep appending until we reach the character limit
  let totalLength = 0;
  let formattedOutput = "";

  for (const check of checkInputs) {
    const description = describeCheck(check);
    if (totalLength + description.length > characterLimit) {
      // TODO handle this case better
      log.warn(
        { limit: characterLimit, checks_length: checks.length },
        "Character limit reached formatMultipleChecks",
      );
      break; // Stop when limit is reached
    }

    formattedOutput += description + "\n";
    totalLength += description.length;
  }

  return formattedOutput;
};

export function summariseMultipleChecksGoal(
  checks: Check[] | CheckTable[],
  options: { maxTokens: number; extraContext?: string | null } = {
    maxTokens: 500,
    extraContext: null,
  },
): PromptDefinitionForText {
  const checksFormatted = formatMultipleChecks(checks);
  const maxTokens = options.maxTokens;

  let prompt = `
### **Task**
Analyze the following monitoring checks and provide a **high-level summary** of their **common goal**.

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
Answer in no more than: ${maxTokens} tokens.
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

export type DegradationAndRetriesTimeline = {
  period: Date;
  data: {
    region: string;
    degraded: number;
    retries: number;
    failures: number;
  }[];
}[];

export function analyseDegradationAndRetriesTimeline(
  timelineData: DegradationAndRetriesTimeline,
  totalRetries: number,
  totalDegradations: number,
): PromptDefinition {
  const messages: CoreMessage[] = [
    {
      role: "system",
      content: `
You are an expert AI in analyzing time-series operational data for distributed systems.

### **Input Data Details:**
You will receive:
1. **timelineData** → a JSON array where each object represents a time period and contains:
   - **period**: The timestamp of the observation (UTC).
   - **data**: Array of per-region metrics for that period.
     - **region**: Name of the region (e.g., "us-east-1", "eu-west-1").
     - **degraded**: Count of degraded events observed in the period.
     - **retries**: Number of retries attempted.
     - **failures**: Number of hard failures recorded.

2. **totalDegradations** → The sum of all degradations across all periods and regions.

3. **totalRetries** → The sum of all retries across all periods and regions.

### **Your Analysis Task:**
Your goal is to analyze patterns leading up to **failures**, focusing specifically on **degradations** and **retries**.

Answer the following:
1. **Degradations Analysis:**
   - Do degradations appear consistently before failure events?
   - Are degradations increasing before failures, suggesting potential leading indicators?
   - Are degradations isolated to specific regions?
   - Always include the **totalDegradations** count in your answer.

2. **Retries Analysis:**
   - Do retries pile up significantly before failures?
   - Are there retry spikes before failure incidents, or are retries minimal?
   - Any notable retry differences between regions?
   - Always include the **totalRetries** count in your answer.

### **Important Instructions:**
- Always mention specific regions and time ranges if clear patterns are visible.
- Highlight whether the latest period(s) show ongoing degradation or retry anomalies.
- Focus strictly on **visible trends** from the data provided.
- Ignore periods with zero activity if no meaningful insight can be drawn.
- Include the total counts (degradations & retries) explicitly.
- Keep the analysis concise, maximum **1 sentence per field**.
- Use only hours for times, and full locations names.

### **Expected Output:**
Respond with a JSON object containing exactly two fields:
1. **degradationsAnalysis**: Summary of degradation behavior, including totalDegradations (max 1 sentence).
2. **retriesAnalysis**: Summary of retry behavior, including totalRetries (max 1 sentence).
`,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Here is the timeline data, along with total degradation and retry counts.
Analyze whether degradations or retries show patterns leading up to failures.
Total degradations: ${totalDegradations}, Total retries: ${totalRetries}`,
        },
        {
          type: "text",
          text: JSON.stringify(timelineData, null, 2),
        },
      ],
    },
  ];

  const schema = z.object({
    degradationsAnalysis: z
      .string()
      .describe(
        "Short summary (max 1 sentence) analyzing degradation patterns leading to failures, explicitly mentioning totalDegradations.",
      ),
    retriesAnalysis: z
      .string()
      .describe(
        "Short summary (max 1 sentence) analyzing retry patterns leading to failures, explicitly mentioning totalRetries.",
      ),
  });

  return defineMessagesPrompt(
    "analyseDegradationAndRetriesTimeline",
    messages,
    schema,
    {
      temperature: 0,
      maxTokens: 1000,
    },
  );
}
