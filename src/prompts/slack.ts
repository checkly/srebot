import { WebhookAlertDto } from "../checkly/alertDTO";
import { convertSlackTimestamp } from "../slackbot/utils";
import { definePrompt, PromptDefinition } from "./common";
import { validObjectList, validObject, validString } from "./validation";
import { z } from "zod";

export const slackFormatInstructions = `Format all output in Slack mrkdwn format.
Generate Slack messages using the following style: *bold*, <link|text>, _italics_, > quote, \`code\`, \`\`\`code block\`\`\`.
It's important to use the correct syntax for the output to be rendered correctly.
E.g. Important Link: <https://link.com|*Important Link*>.`;

export interface SlackMsgForPrompt {
  plaintext: string;
  ts?: string;
}

/**
 * Formats a Slack message for inclusion in the prompt
 */
function formatSlackMessageForPrompt(msg: SlackMsgForPrompt): string {
  return `${convertSlackTimestamp(msg.ts!).toISOString()} Message: ${msg.plaintext}`;
}

/**
 * Schema for channel summary response
 */
const channelSummarySchema = z.object({
  summary: z.string().describe("Concise summary of the channel context"),
  relevantLinks: z
    .array(
      z.object({
        url: z.string(),
        title: z.string(),
      }),
    )
    .describe(
      "Links that are relevant to the given question or channel summary",
    ),
});

/**
 * Generates a prompt for analyzing Slack channel context
 */
export function channelSummaryPrompt(
  alert: WebhookAlertDto,
  messageHistory: SlackMsgForPrompt[],
): PromptDefinition {
  validObject.parse(alert);
  validObjectList.parse(messageHistory);

  const prompt = `You are a Slack channel context collector. Your task is to analyze the given message history based on a specific prompt and provide a concise summary of the relevant context.

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
4. Your summary should NOT be longer than 3-5 sentences.`;

  return definePrompt("channelSummary", prompt, channelSummarySchema, {
    temperature: 0,
  });
}

// Export these types for use in other files that may need them
export type ChannelSummaryResponse = z.infer<typeof channelSummarySchema>;
