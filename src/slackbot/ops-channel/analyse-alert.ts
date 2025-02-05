import { generateObject } from "ai";
import moment from "moment";
import { z } from "zod";
import { getOpenaiSDKClient } from "../../ai/openai";
import { fetchDocumentsFromKnowledgeBase } from "../../notion/notion";
import { convertSlackTimestamp, fetchHistoricalMessages } from "../utils";

const OPS_CHANNEL_GUIDELINES_SLUG = process.env.OPS_CHANNEL_GUIDELINES_SLUG || "ops-channel-guidelines";

export type AnalyseAlertOutput = {
  recommendation?: "ignore" | "analyse" ;
  state?: "firing" | "recovered";
  reasoning: string;
  affectedComponents?: { component: string, environment: "development" | "staging" | "production" }[];
  severity?: "low" | "medium" | "high" | "critical";
  historyOutput?: {
    type: "new" | "recurring" | "escalating";
    reasoning: string;
    pastMessageLinks: string[];
    confidence: number;
  }
  summary?: string;
  escalateToIncidentResponse?: boolean;
}

// Define structured output schema for alert severity
function getFormattedMessages(messages: any[], channelId: string , messageTs: string): string {
  const generateSlackMessageLink = (event: { channel: string; ts: string }) => {
    if(!process.env.SLACK_TEAM_DOMAIN){
      return ''
    }

    const formattedTs = event.ts.replace(".", ""); // Convert ts to Slack's format
    return `Slack link: https://${process.env.SLACK_TEAM_DOMAIN}.slack.com/archives/${channelId}/p${formattedTs}`;
  };

  return messages
    .filter((m) => m.ts !== messageTs)
    .map((m) => `<message>${convertSlackTimestamp(m.ts!).toISOString()} ${generateSlackMessageLink(m)} Text: ${m.plaintext}</message>`)
    .join("\n");
}

// Function to determine severity of an alert
export const analyseAlert = async (alertMessage: string, channelId:string, messageTs: string): Promise<AnalyseAlertOutput> => {
  const knowledgeDocuments = await fetchDocumentsFromKnowledgeBase();

  // Use an array filter to find the document with the specified slug
  // This way it won't explode if the document is not found
  const opsChannelGuidelines = knowledgeDocuments.filter((doc) => doc.slug === OPS_CHANNEL_GUIDELINES_SLUG);

  const model = getOpenaiSDKClient()("gpt-4o-mini");
  const affectedComponentsOutput = await generateObject({
    model: model,
    system: "You are an experienced on-call engineer who is responsible for determining which system components are affected by an alert",
    prompt: `Analyze the following alert message and determine which system components and environment it is related to.

    Alert: "${alertMessage}"

    Here are the guidelines for determining the affected components and environment:
    ${JSON.stringify(opsChannelGuidelines)}
    `,
    output: 'array',
    schema: z.object({
      component: z.string().describe("the name of the affected component. Only mention the components defined in the guidelines. Do not come up with your own components"),
      environment: z.enum(["development", "staging", "production"]).describe("the environment in which the component is running"),
      repository: z.string().optional().describe("The repository where the component is located, use organization/repository format"),
      reasoning: z.string().describe("Explanation of why the alert is classified at this severity level."),
      confidence: z.number().describe("Confidence level of the component identification. Use a number between 0 and 100 (inclusive). 100 means that you are 100% confident in the recommendation."),
    }),
    experimental_telemetry: {
      isEnabled: true
    },
  });
  const confidentAffectedComponents = affectedComponentsOutput.object.filter((affected) => affected.confidence >= 90);

  const recommendationOutput = await generateObject({
    model: model,
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
    experimental_telemetry: {
      isEnabled: true,
    },
  });

  if (recommendationOutput.object.recommendation === "ignore" && recommendationOutput.object.confidence > 80) {
    return recommendationOutput.object;
  }

  const affectedComponentsWithRepoNonDev = confidentAffectedComponents.filter((affected) => affected.environment !== "development" && !affected.repository);
  // TODO implement logic to determine severity based on affected components and environments
  console.log("I have identified the following components affected in non dev environments with a repo", affectedComponentsWithRepoNonDev)

  const fromDate = moment().subtract(3, "days").toDate();
  const messages = await fetchHistoricalMessages(channelId, 300, fromDate);
  const messageHistory = getFormattedMessages(messages, channelId, messageTs);
  const historyOutput = await generateObject({
    model: model,
    system: "You are an experienced on-call engineer who is responsible for analysing previous alert in the slack channel",
    prompt: `Your task is to analyse the messages from the previous 72h.
      Determine if the alert is new, escalating or a recurring issue.
      1. Alerts that are recurring are those that have been resolved and reappeared within the last 72h.
      2. If the alert is recurring, provide links to the relevant messages that indicate a recurring issue.
      3. Alerts that are escalating are those that were recurring in the last 72h before but recently became much more common.
      4. For escalating alerts, provide links to the relevant messages that indicate an escalating issue.
      5. New alerts are those that haven't been seen in the last 72h.
      6. Take into account that previous alert messages might not contain the exact alert message, but they might contain relevant information.

    Alert: "${alertMessage}"

    Here is the message history from the Slack channel:
    ${messageHistory}`,
    schema: z.object({
      type: z.enum(["new", "recurring", "escalating"]).describe("Alert type, whether it is a new issue or a recurring problem."),
      reasoning: z.string().describe("Explanation of why the alert is classified at this severity level."),
      confidence: z.number().describe("Confidence level of the recommendation. Use a number between 0 and 100 (inclusive). 100 means that you are 100% confident in the recommendation."),
      pastMessageLinks: z
        .array(z.string())
        .describe(
          "Slack Links to relevant past messages that indicate a recurring issue."
        ),
    }),
    experimental_telemetry: {
      isEnabled: true,
    },
  });

  console.log(`History: ${historyOutput.object.type} My reasoning:`, historyOutput.object.reasoning, "Confidence", historyOutput.object.confidence)

  const severityOutput = await generateObject({
    model: model,
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
    experimental_telemetry: {
      isEnabled: true,
    },
  });

  console.log(`Severity: ${severityOutput.object.severity} My reasoning:`, severityOutput.object.reasoning)

  const summary = await generateObject({
    model: model,
    system: "You are an experienced on-call engineer who is leading a team of engineers analysing alerts from a Slack channel",
    prompt: `Your team gathered the following information about the alert:

    Alert Message:
    "${alertMessage}"

    Affected Components:
    ${confidentAffectedComponents.map((affected) => `Component: ${affected.component} in environment: ${affected.environment}`).join("\n")}

    Severity:
    ${severityOutput.object.severity}

    Severity Reasoning:
    ${severityOutput.object.reasoning}

    Alert State:
    ${recommendationOutput.object.state}

    Alert State Reasoning:
    ${recommendationOutput.object.reasoning}

    Alert Frequency:
    ${historyOutput.object.type}

    Alert Frequency Reasoning:
    ${historyOutput.object.reasoning}

    Your task is to provide a system impact assessment for the on-call manager.
    1. Keep it concise and to the point.
    2. Assume that the on-call manager is highly experienced and has a deep understanding of the system.
    3. The manager will also receive the original alert message. Do not repeat obvious information from the alert message.
    4. Focus on potential customer impact. Take into account the scale of the impact. Issues that affect a large number of customers are more severe.
    5. Provide a recommendation whether to escalate to an incident response team.
    6. Only escalate to the incident response team if an issue is escalating or new.

    Keep in mind the following guidelines:
    ${JSON.stringify(opsChannelGuidelines)}
    `,
    schema: z.object({
      escalateToIncidentResponse: z.boolean().optional().describe("Whether to escalate to incident response team"),
      summary: z.string().describe("Concise executive summary of the alert."),
      reasoning: z.string().describe("Explain the reason behind escalatingToIncidentResponse"),
      escalateConfidence: z.number().describe("Confidence level of the recommendation. Use a number between 0 and 100 (inclusive). 100 means that you are 100% confident in the recommendation."),
    }),
    experimental_telemetry: {
      isEnabled: true,
    },
  });

  console.log(`I'm recommending to escalate to the incident response team: ${summary.object.escalateToIncidentResponse} My reasoning:`, summary.object.reasoning, "Confidence:", summary.object.escalateConfidence)

  return {
    ...severityOutput.object,
    affectedComponents: confidentAffectedComponents,
    historyOutput: historyOutput.object,
    summary: summary.object.summary,
    recommendation: recommendationOutput.object.recommendation,
    escalateToIncidentResponse: summary.object.escalateToIncidentResponse,
  }
};
