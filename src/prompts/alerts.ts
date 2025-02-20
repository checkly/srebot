import { z } from "zod";
import { NotionPage } from "../notion/notion";
import { definePrompt, PromptDefinition } from "./common";
import { validObjectList, validString } from "./validation";

export function affectedComponentsPrompt(
  guidelines: NotionPage[], // guidelines for ops channel
  alertMessage: string,
) {
  validObjectList.parse(guidelines);
  validString.parse(alertMessage);

  const systemPrompt = `You are an experienced on-call engineer who is responsible for determining which system components are affected by an alert`;
  const prompt = `Analyze the following alert message and determine which system components and environment it is related to.

    Alert: "${alertMessage}"

    Here are the guidelines for determining the affected components and environment:
    ${JSON.stringify(guidelines)}`;

  const schema = z.object({
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
  });

  return definePrompt("affectedComponents", prompt, schema, {
    output: "array",
    system: systemPrompt,
  });
}

export function alertRecommendationPrompt(
  guidelines: NotionPage[],
  alertMessage: string,
  affectedComponents: { component: string; environment: string }[],
): PromptDefinition<"object"> {
  validObjectList.parse(guidelines);
  validString.parse(alertMessage);
  validObjectList.parse(affectedComponents);

  const system =
    "You are an experienced on-call engineer who is responsible for recommending further actions for an alert";

  const prompt = `Analyze if it is firing or recovered.

    Alert: "${alertMessage}"

    We have determined that the following components and environments are affected:
    ${affectedComponents.map((affected) => `Component: ${affected.component} in environment: ${affected.environment}`).join("\n")}

    Below you will find the guidelines for alerts:
    - Determine the course of action based on alert state
    ${JSON.stringify(guidelines)}`;

  const schema = z.object({
    recommendation: z
      .enum(["ignore", "analyse"])
      .describe("The severity level of the alert."),
    state: z.enum(["firing", "recovered"]).describe("The state of the alert."),
    reasoning: z
      .string()
      .describe("Explanation why do you recommend this action."),
    confidence: z
      .number()
      .describe(
        "Confidence level of the recommendation. Use a number between 0 and 100 (inclusive). 100 means that you are 100% confident in the recommendation.",
      ),
  });

  return definePrompt("alertRecommendation", prompt, schema, {
    system,
    output: "object",
  });
}

export function alertHistoryPrompt(
  alertMessage: string,
  messageHistory: string,
): PromptDefinition<"object"> {
  validString.parse(alertMessage);
  validString.parse(messageHistory);

  const system =
    "You are an experienced on-call engineer who is responsible for analysing previous alert in the slack channel";

  const prompt = `Your task is to analyse the messages from the previous 72h.
      Determine if the alert is new, escalating or a recurring issue.
      1. Alerts that are recurring are those that have been resolved and reappeared within the last 72h.
      2. If the alert is recurring, provide links to the relevant messages that indicate a recurring issue.
      3. Alerts that are escalating are those that were recurring in the last 72h before but recently became much more common.
      4. For escalating alerts, provide links to the relevant messages that indicate an escalating issue.
      5. New alerts are those that haven't been seen in the last 72h.
      6. Take into account that previous alert messages might not contain the exact alert message, but they might contain relevant information.

    Alert: "${alertMessage}"

    Here is the message history from the Slack channel:
    ${messageHistory}`;

  const schema = z.object({
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
  });

  return definePrompt("alertHistory", prompt, schema, {
    system,
    output: "object",
  });
}

export function alertSeverityPrompt(
  alertMessage: string,
  affectedComponents: { component: string; environment: string }[],
): PromptDefinition {
  validString.parse(alertMessage);
  validObjectList.parse(affectedComponents);

  const prompt = `Analyze the following alert message and determine its severity level with reasoning.

  Alert: "${alertMessage}"

  We have determined that the following components and environments are affected:
    ${affectedComponents.map((affected) => `Component: ${affected.component} in environment: ${affected.environment}`).join("\n")}`;

  const system =
    "You are an experienced on-call engineer who is responsible for determining the severity of alerts";

  const schema = z.object({
    severity: z
      .enum(["low", "medium", "high", "critical"])
      .describe("The severity level of the alert."),
    reasoning: z
      .string()
      .describe(
        "Explanation of why the alert is classified at this severity level.",
      ),
  });

  return definePrompt("alertSeverity", prompt, schema, {
    system,
  });
}

export function alertSummaryPrompt(
  alertMessage: string,
  affectedComponents: { component: string; environment: string }[],
  severityInfo: { severity: string; reasoning: string },
  stateInfo: { state: string; reasoning: string },
  historyInfo: { type: string; reasoning: string },
  guidelines: NotionPage[],
): PromptDefinition {
  validObjectList.parse(affectedComponents);
  [
    alertMessage,
    severityInfo.severity,
    severityInfo.reasoning,
    stateInfo.state,
    stateInfo.reasoning,
    historyInfo.type,
    historyInfo.reasoning,
  ].forEach((s) => validString.parse(s));

  const schema = z.object({
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
        "Confidence level of the recommendation. Use a number between 0 and 100 (inclusive).",
      ),
  });

  const prompt = `Your team gathered the following information about the alert:

    Alert Message:
    "${alertMessage}"

    Affected Components:
    ${affectedComponents.map((affected) => `Component: ${affected.component} in environment: ${affected.environment}`).join("\n")}

    Severity:
    ${severityInfo.severity}

    Severity Reasoning:
    ${severityInfo.reasoning}

    Alert State:
    ${stateInfo.state}

    Alert State Reasoning:
    ${stateInfo.reasoning}

    Alert Frequency:
    ${historyInfo.type}

    Alert Frequency Reasoning:
    ${historyInfo.reasoning}

    Your task is to provide a system impact assessment for the on-call manager.
    1. Keep it concise and to the point.
    2. Assume that the on-call manager is highly experienced and has a deep understanding of the system.
    3. The manager will also receive the original alert message. Do not repeat obvious information from the alert message.
    4. Focus on potential customer impact. Take into account the scale of the impact. Issues that affect a large number of customers are more severe.
    5. Provide a recommendation whether to escalate to an incident response team.
    6. Only escalate to the incident response team if an issue is escalating or new.

    Keep in mind the following guidelines:
    ${JSON.stringify(guidelines)}`;

  const system =
    "You are an experienced on-call engineer who is leading a team of engineers analysing alerts from a Slack channel";

  return definePrompt("alertSummary", prompt, schema, {
    system,
  });
}
