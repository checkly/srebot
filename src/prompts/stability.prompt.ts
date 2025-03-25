import { defineMessagesPrompt, PromptDefinition } from "./common";
import { z } from "zod";
import { CoreSystemMessage, CoreUserMessage } from "ai";

export type StabilityAnalysisTimeLine = {
  period: Date;
  data: {
    region: string;
    degraded: number;
    retries: number;
    failures: number;
    passing: number;
    failureRate: number;
  }[];
}[];

export enum Stability {
  HEALTHY = "HEALTHY",
  FLAKY = "FLAKY",
  UNHEALTHY = "UNHEALTHY",
  UNKNOWN = "UNKNOWN",
}

export function stabilityPrompt(
  timelineData: StabilityAnalysisTimeLine,
  totalRetries: number,
  totalDegradations: number,
): PromptDefinition<"object"> {
  const systemPrompt: CoreSystemMessage = {
    role: "system",
    content: `You are an AI specialized in analyzing operational stability across distributed systems, focusing on identifying patterns of system health through detailed timeline data.

### Input Data Details
You will receive timeline data with the following structure:
1. **timelineData**: A JSON array where each object represents a 30-minute time period and contains:
   - **period**: The timestamp of the observation (UTC)
   - **data**: Array of per-region metrics for that 30-minute period
     - **region**: Name of the region (e.g., "us-east-1", "eu-west-1")
     - **degraded**: Count of degraded events observed in the period
     - **retries**: Number of retries attempted
     - **failures**: Number of hard failures recorded
     - **passing**: Number of passing checks
     - **failureRate**: Calculated failure percentage

## Core Analysis Objectives
Your goal is to:
1. Classify the overall system stability using the ${Stability.HEALTHY}, ${Stability.FLAKY}, or ${Stability.UNHEALTHY} categories
2. Analyze degradation patterns
3. Examine retry mechanisms
4. Identify potential systemic issues

## Stability Classification Criteria
- **${Stability.HEALTHY}**: Minimal or no failures in the past observation period
- **${Stability.FLAKY}**: Sporadic, inconsistent failures without clear patterns
- **${Stability.UNHEALTHY}**: Distinct failure incidents or ongoing issues at the latest timestamp

## Analysis Methodology

### 1. Stability Classification
- Examine the entire timeline for failure patterns
- Consider:
  - Frequency and distribution of failures
  - Persistence of issues
  - Impact across different regions

### 2. Degradations Analysis
- Investigate degradation events leading to failures
- Key Questions:
  - Are degradations consistent precursors to failures?
  - Do degradations increase before failure events?
  - Are degradations region-specific?

### 3. Retries Analysis
- Analyze retry mechanisms and their relationship to system failures
- Investigate:
  - Retry frequency and timing
  - Correlation between retry counts and failure events
  - Regional variations in retry patterns

## Reporting Guidelines
- Be concise and precise
- Focus on visible trends in the data
- Explicitly mention:
  - Total degradation count
  - Total retry count
  - Specific regions affected (if applicable)
  - Time ranges of notable events

## Expected Output
Provide a JSON object with the following fields:
- \`stability\`: One of ["${Stability.HEALTHY}", "${Stability.FLAKY}", "${Stability.UNHEALTHY}"]
- \`degradationsAnalysis\`: One-sentence summary of degradation patterns
- \`retriesAnalysis\`: One-sentence summary of retry behaviors
- \`failuresAnalysis\`: Brief summary of failure incidents

### Important Constraints
- Maximum 1 sentence per analysis field
- Use full location names
- Report only observable trends
- Ignore periods with zero activity`,
  } as CoreSystemMessage;

  const messages = [
    systemPrompt,
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
    } as CoreUserMessage,
  ];

  const schema = z.object({
    stability: z
      .nativeEnum(Stability)
      .describe(
        `You must choose exactly one of ["${Stability.HEALTHY}", "${Stability.FLAKY}", "${Stability.UNHEALTHY}"]. If you see no failures at any time, pick ${Stability.HEALTHY}. If failures occur but are resolved by the last timestamp, pick ${Stability.FLAKY}. If any region still fails at the final timestamp or has continuous failures, pick ${Stability.UNHEALTHY}`,
      ),
    degradationsAnalysis: z
      .string()
      .describe(
        "Short summary (max 1 sentence) analyzing degradation patterns leading to failures, explicitly mentioning the number of total degradations.",
      ),
    retriesAnalysis: z
      .string()
      .describe(
        "Short summary (max 1 sentence) analyzing retry patterns leading to failures, explicitly mentioning the number of total retries.",
      ),
    failuresAnalysis: z
      .string()
      .describe(
        "Brief summary of the failure incidents, with their time-frame.\n         For each incident mention if it affected all locations, or a subset.\n         Use only hours for times, and full locations names.\n         If there is no clear pattern (sporadic or random failures)- do not mention specific times or locations.\n         If the failures are still happening, mention it. Use 2 sentences max.",
      ),
  });

  return defineMessagesPrompt("stabilityAnalysis", messages, schema, {
    temperature: 0,
    maxTokens: 1000,
  });
}
