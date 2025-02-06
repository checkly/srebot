import { WebhookAlertDto } from "../checkly/alertDTO";
import { convertSlackTimestamp } from "../slackbot/utils";
import { PromptConfig, promptConfig } from "./common";

export const slackFormatInstructions = `Format all output in Slack mrkdwn format.
Generate Slack messages using the following style: *bold*, <link|text>, _italics_, > quote, \`code\`, \`\`\`code block\`\`\`.
It's important to use the correct syntax for the output to be rendered correctly.
E.g. Important Link: <https://link.com|*Important Link*>.`;

/**
 * Represents a simplified Slack message structure used for prompt generation.
 * @interface SlackMsgForPrompt
 * @property {string} plaintext - The plain text content of the Slack message
 * @property {string} [ts] - Optional Slack timestamp for the message
 */
export interface SlackMsgForPrompt {
  plaintext: string;
  ts?: string;
}

/**
 * Generates a prompt for analyzing Slack channel context based on an alert and message history.
 * The function creates a structured prompt that instructs an AI to analyze Slack messages
 * and provide relevant context related to a specific alert.
 *
 * @param {WebhookAlertDto} alert - The alert data containing information about the triggered event
 * @param {SlackMsgForPrompt[]} messageHistory - Array of Slack messages to analyze for context
 * @returns {string} A formatted prompt string containing instructions and context for analysis
 */
export function channelSummaryPrompt(
  alert: WebhookAlertDto,
  messageHistory: SlackMsgForPrompt[],
): [string, PromptConfig] {
  return [
    `You are a Slack channel context collector. Your task is to analyze the given message history based on a specific prompt and provide a concise summary of the relevant context.

  What are the recent events, discussions or relevant context related to the following alert?

  ${JSON.stringify({
    title: alert.ALERT_TITLE,
    type: alert.ALERT_TYPE,
    name: alert.CHECK_NAME,
    runLocation: alert.RUN_LOCATION,
    responseTime: alert.RESPONSE_TIME,
    tags: alert.TAGS,
  })}

Here is the message history from the Slack channel:
<message_history>
${messageHistory.map(formatSlackMessageForPrompt).join(" ")}
</message_history>

To complete the task, follow these steps:
1. Carefully read through the entire message history.
2. Identify the main topics, themes, or discussions that are relevant to the prompt.
3. Create a concise summary of the channel's content related to the prompt, highlighting the most relevant and important information.
4. Your summary should NOT be longer than 3-5 sentences.
`,
    promptConfig({ temperature: 0 }),
  ];
}

/**
 * Formats a Slack message for inclusion in the prompt by combining its timestamp and content.
 * Converts the Slack timestamp to ISO format and combines it with the message content.
 *
 * @param {SlackMsgForPrompt} msg - The Slack message to format
 * @returns {string} A formatted string containing the message timestamp and content
 * @throws {Error} Will throw if ts property is undefined (note the non-null assertion)
 */
function formatSlackMessageForPrompt(msg: SlackMsgForPrompt): string {
  return `${convertSlackTimestamp(msg.ts!).toISOString()} Message: ${msg.plaintext}`;
}
