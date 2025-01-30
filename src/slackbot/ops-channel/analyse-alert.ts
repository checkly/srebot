import { z } from "zod";
import { generateObject } from "ai";
import { getOpenaiSDKClient } from "../../ai/openai";
import { fetchDocumentsFromKnowledgeBase } from "../../notion/notion";

const OPS_CHANNEL_GUIDELINES_SLUG = process.env.OPS_CHANNEL_GUIDELINES_SLUG || "ops-channel-guidelines";

export type AnalyseAlertOutput = {
  recommendation?: "ignore" | "analyse";
  state?: "firing" | "recovered";
  reasoning: string;
  affectedComponents?: { component: string, environment: "development" | "staging" | "production" }[];
  severity?: "low" | "medium" | "high" | "critical";
}

// Define structured output schema for alert severity
// Function to determine severity of an alert
export const analyseAlert = async (alertMessage: string): Promise<AnalyseAlertOutput> => {
  const knowledgeDocuments = await fetchDocumentsFromKnowledgeBase();

  // Use an array filter to find the document with the specified slug
  // This way it won't explode if the document is not found
  const opsChannelGuidelines = knowledgeDocuments.filter((doc) => doc.slug === OPS_CHANNEL_GUIDELINES_SLUG);

  const affectedComponentsOutput = await generateObject({
    model: getOpenaiSDKClient()("gpt-4o"),
    system: "You are an experienced on-call engineer who is responsible for determining which components are affected by an alert",
    prompt: `Analyze the following alert message and determine which software components and environment is it coming from.

    Alert: "${alertMessage}"

    Here are the guidelines for determining the affected components and environment:
    ${JSON.stringify(opsChannelGuidelines)}
    `,
    output: 'array',
    schema: z.object({
      component: z.string().describe("the name of the affected component"),
      environment: z.enum(["development", "staging", "production"]).describe("the environment in which the component is running"),
      repository: z.string().optional().describe("The repository where the component is located, use organization/repository format"),
      reasoning: z.string().describe("Explanation of why the alert is classified at this severity level."),
      confidence: z.number().describe("Confidence level of the component identification. Use a number between 0 and 100 (inclusive). 100 means that you are 100% confident in the recommendation."),
    })
  });
  const confidentAffectedComponents = affectedComponentsOutput.object.filter((affected) => affected.confidence > 80);

  const recommendationOutput = await generateObject({
    model: getOpenaiSDKClient()("gpt-4o"),
    system: "You are an experienced on-call engineer who is responsible for recommending further actions for an alert",
    prompt: `Analyze if it is firing or recovered.

    Alert: "${alertMessage}"

    We have determined that the following components and environments are affected:
    ${confidentAffectedComponents.map((affected) => `Component: ${affected.component} in environment: ${affected.environment}`).join("\n")}

    Below you will find the guidelines for alerts:
    - Determine the course of action based on alert state
    ${JSON.stringify(opsChannelGuidelines)}`
    ,
    schema: z.object({
      recommendation: z.enum(["ignore", "analyse"]).describe("The severity level of the alert."),
      state: z.enum(["firing", "recovered"]).describe("The state of the alert."),
      reasoning: z.string().describe("Explanation why do you recommend this action."),
      confidence: z.number().describe("Confidence level of the recommendation. Use a number between 0 and 100 (inclusive). 100 means that you are 100% confident in the recommendation."),
    }),
  });

  if (recommendationOutput.object.recommendation === "ignore" && recommendationOutput.object.confidence > 80) {
    return recommendationOutput.object;
  }

  const affectedComponentsWithRepoNonDev = confidentAffectedComponents.filter((affected) => affected.environment !== "development" && !affected.repository);

  // TODO implement logic to determine severity based on affected components and environments
  console.log("I have identified the following components affected in non dev environments with a repo", affectedComponentsWithRepoNonDev)

  const severityOutput = await generateObject({
    model: getOpenaiSDKClient()("gpt-4o"),
    system: "You are an experienced on-call engineer who is responsible for determining the severity of alerts",
    prompt: `Analyze the following alert message and determine its severity level with reasoning.

    Alert: "${alertMessage}"

    We have determined that the following components and environments are affected:
    ${confidentAffectedComponents.map((affected) => `Component: ${affected.component} in environment: ${affected.environment}`).join("\n")}

    Return a JSON object with:
    - severity: "low", "medium", "high", or "critical"
    - reasoning: explanation of why this severity level was chosen`,
    schema: z.object({
      severity: z.enum(["low", "medium", "high", "critical"]).describe("The severity level of the alert."),
      reasoning: z.string().describe("Explanation of why the alert is classified at this severity level."),
    }),
  });

  return {
    ...severityOutput.object,
    affectedComponents: confidentAffectedComponents,
  }
};
