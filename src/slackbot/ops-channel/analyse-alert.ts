import { generateObject } from "ai";
import moment from "moment";
import { fetchDocumentsFromKnowledgeBase } from "../../notion/notion";
import {
  affectedComponentsPrompt,
  alertHistoryPrompt,
  alertRecommendationPrompt,
  alertSeverityPrompt,
  alertSummaryPrompt,
} from "../../prompts/alerts";
import { convertSlackTimestamp } from "../utils";
import { SlackClient } from "../../slack/slack";

const slackClient = new SlackClient(process.env.SLACK_AUTH_TOKEN || "");

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

  const affectedComponentsOutput = await generateObject(
    affectedComponentsPrompt(opsChannelGuidelines, alertMessage),
  );

  const confidentAffectedComponents = affectedComponentsOutput.object.filter(
    (affected) => affected.confidence >= 90,
  );

  const recommendationOutput = await generateObject(
    alertRecommendationPrompt(
      opsChannelGuidelines,
      alertMessage,
      confidentAffectedComponents.map((c) => ({
        component: c.component,
        environment: c.environment,
      })),
    ),
  );

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
  const messages = await slackClient.fetchHistoricalMessages(
    channelId,
    300,
    fromDate,
  );
  const messageHistory = getFormattedMessages(messages, channelId, messageTs);

  const historyOutput = await generateObject(
    alertHistoryPrompt(alertMessage, messageHistory),
  );

  console.log(
    `History: ${historyOutput.object.type} My reasoning:`,
    historyOutput.object.reasoning,
    "Confidence",
    historyOutput.object.confidence,
  );

  const severityOutput = await generateObject(
    alertSeverityPrompt(alertMessage, confidentAffectedComponents),
  );

  console.log(
    `Severity: ${severityOutput.object.severity} My reasoning:`,
    severityOutput.object.reasoning,
  );

  const summary = await generateObject(
    alertSummaryPrompt(
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
    ),
  );

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
