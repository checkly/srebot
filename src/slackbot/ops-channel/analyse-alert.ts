import { z } from "zod";
import { generateObject } from "ai";
import { fetchDocumentsFromKnowledgeBase } from "../../notion/notion";
import { convertSlackTimestamp, fetchHistoricalMessages } from "../utils";
import moment from "moment";
import {
  alertHistoryPrompt,
  alertRecommendationPrompt,
  alertSeverityPrompt,
  alertSummaryPrompt,
} from "src/prompts/alerts";

const OPS_CHANNEL_GUIDELINES_SLUG =
  process.env.OPS_CHANNEL_GUIDELINES_SLUG || "ops-channel-guidelines";

export type AnalyseAlertOutput = {
  recommendation?: "ignore" | "analyse";
  state?: "firing" | "recovered";
  reasoning: string;
  affectedComponents?: {
    component: string;
    environment: "development" | "staging" | "production";
  }[];
  severity?: "low" | "medium" | "high" | "critical";
  historyOutput?: {
    type: "new" | "recurring" | "escalating";
    reasoning: string;
    pastMessageLinks: string[];
    confidence: number;
  };
  summary?: string;
  escalateToIncidentResponse?: boolean;
};

// Define structured output schema for alert severity
function getFormattedMessages(
  messages: any[],
  channelId: string,
  messageTs: string,
): string {
  const generateSlackMessageLink = (event: { channel: string; ts: string }) => {
    if (!process.env.SLACK_TEAM_DOMAIN) {
      return "";
    }

    const formattedTs = event.ts.replace(".", ""); // Convert ts to Slack's format
    return `Slack link: https://${process.env.SLACK_TEAM_DOMAIN}.slack.com/archives/${channelId}/p${formattedTs}`;
  };

  return messages
    .filter((m) => m.ts !== messageTs)
    .map(
      (m) =>
        `<message>${convertSlackTimestamp(m.ts!).toISOString()} ${generateSlackMessageLink(m)} Text: ${m.plaintext}</message>`,
    )
    .join("\n");
}

// Function to determine severity of an alert
export const analyseAlert = async (
  alertMessage: string,
  channelId: string,
  messageTs: string,
): Promise<AnalyseAlertOutput> => {
  const knowledgeDocuments = await fetchDocumentsFromKnowledgeBase();

  // Use an array filter to find the document with the specified slug
  // This way it won't explode if the document is not found
  const opsChannelGuidelines = knowledgeDocuments.filter(
    (doc) => doc.slug === OPS_CHANNEL_GUIDELINES_SLUG,
  );

  const [compPrompt, compConfig] = alertAnalysisSystemPrompt(
    opsChannelGuidelines,
    alertMessage,
  );
  const affectedComponentsOutput = await generateObject({
    ...compConfig,
    prompt: compPrompt,
    output: "array",
    schema: z.object({
      component: z
        .string()
        .describe(
          "the name of the affected component. Only mention the components defined in the guidelines. Do not come up with your own components",
        ),
      environment: z
        .enum(["development", "staging", "production"])
        .describe("the environment in which the component is running"),
      repository: z
        .string()
        .optional()
        .describe(
          "The repository where the component is located, use organization/repository format",
        ),
      reasoning: z
        .string()
        .describe(
          "Explanation of why the alert is classified at this severity level.",
        ),
      confidence: z
        .number()
        .describe(
          "Confidence level of the component identification. Use a number between 0 and 100 (inclusive). 100 means that you are 100% confident in the recommendation.",
        ),
    }),
  });

  const confidentAffectedComponents = affectedComponentsOutput.object.filter(
    (affected) => affected.confidence >= 90,
  );

  const [recoPrompt, recoConfig] = alertRecommendationPrompt(
    opsChannelGuidelines,
    alertMessage,
    confidentAffectedComponents.map((c) => ({
      component: c.component,
      environment: c.environment,
    })),
  );

  const recommendationOutput = await generateObject({
    ...recoConfig,
    prompt: recoPrompt,
    schema: z.object({
      recommendation: z
        .enum(["ignore", "analyse"])
        .describe("The severity level of the alert."),
      state: z
        .enum(["firing", "recovered"])
        .describe("The state of the alert."),
      reasoning: z
        .string()
        .describe("Explanation why do you recommend this action."),
      confidence: z
        .number()
        .describe(
          "Confidence level of the recommendation. Use a number between 0 and 100 (inclusive). 100 means that you are 100% confident in the recommendation.",
        ),
    }),
  });

  if (
    recommendationOutput.object.recommendation === "ignore" &&
    recommendationOutput.object.confidence > 80
  ) {
    return recommendationOutput.object;
  }

  const affectedComponentsWithRepoNonDev = confidentAffectedComponents.filter(
    (affected) =>
      affected.environment !== "development" && !affected.repository,
  );
  // TODO implement logic to determine severity based on affected components and environments
  console.log(
    "I have identified the following components affected in non dev environments with a repo",
    affectedComponentsWithRepoNonDev,
  );

  const fromDate = moment().subtract(3, "days").toDate();
  const messages = await fetchHistoricalMessages(channelId, 300, fromDate);
  const messageHistory = getFormattedMessages(messages, channelId, messageTs);

  const [historyPrompt, historyConfig] = alertHistoryPrompt(
    alertMessage,
    messageHistory,
  );

  const historyOutput = await generateObject({
    ...historyConfig,
    prompt: historyPrompt,
    schema: z.object({
      type: z
        .enum(["new", "recurring", "escalating"])
        .describe(
          "Alert type, whether it is a new issue or a recurring problem.",
        ),
      reasoning: z
        .string()
        .describe(
          "Explanation of why the alert is classified at this severity level.",
        ),
      confidence: z
        .number()
        .describe(
          "Confidence level of the recommendation. Use a number between 0 and 100 (inclusive). 100 means that you are 100% confident in the recommendation.",
        ),
      pastMessageLinks: z
        .array(z.string())
        .describe(
          "Slack Links to relevant past messages that indicate a recurring issue.",
        ),
    }),
  });

  console.log(
    `History: ${historyOutput.object.type} My reasoning:`,
    historyOutput.object.reasoning,
    "Confidence",
    historyOutput.object.confidence,
  );

  const [severityPrompt, severityConfig] = alertSeverityPrompt(
    alertMessage,
    confidentAffectedComponents,
  );

  const severityOutput = await generateObject({
    ...severityConfig,
    prompt: severityPrompt,
    schema: z.object({
      severity: z
        .enum(["low", "medium", "high", "critical"])
        .describe("The severity level of the alert."),
      reasoning: z
        .string()
        .describe(
          "Explanation of why the alert is classified at this severity level.",
        ),
    }),
  });

  console.log(
    `Severity: ${severityOutput.object.severity} My reasoning:`,
    severityOutput.object.reasoning,
  );

  const [summaryPrompt, summaryConfig] = alertSummaryPrompt(
    alertMessage,
    confidentAffectedComponents,
    {
      severity: severityOutput.object.severity,
      reasoning: severityOutput.object.reasoning,
    },
    {
      state: recommendationOutput.object.state,
      reasoning: recommendationOutput.object.reasoning,
    },
    {
      type: historyOutput.object.type,
      reasoning: historyOutput.object.reasoning,
    },
    opsChannelGuidelines,
  );

  const summary = await generateObject({
    ...summaryConfig,
    prompt: summaryPrompt,
    schema: z.object({
      escalateToIncidentResponse: z
        .boolean()
        .optional()
        .describe("Whether to escalate to incident response team"),
      summary: z.string().describe("Concise executive summary of the alert."),
      reasoning: z
        .string()
        .describe("Explain the reason behind escalatingToIncidentResponse"),
      escalateConfidence: z
        .number()
        .describe(
          "Confidence level of the recommendation. Use a number between 0 and 100 (inclusive). 100 means that you are 100% confident in the recommendation.",
        ),
    }),
  });

  console.log(
    `I'm recommending to escalate to the incident response team: ${summary.object.escalateToIncidentResponse} My reasoning:`,
    summary.object.reasoning,
    "Confidence:",
    summary.object.escalateConfidence,
  );

  return {
    ...severityOutput.object,
    affectedComponents: confidentAffectedComponents,
    historyOutput: historyOutput.object,
    summary: summary.object.summary,
    recommendation: recommendationOutput.object.recommendation,
    escalateToIncidentResponse: summary.object.escalateToIncidentResponse,
  };
};
