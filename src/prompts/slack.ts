import { WebhookAlertDto } from "src/checkly/alertDTO";
import { convertSlackTimestamp } from "src/slackbot/utils";

export interface SlackMsgForPrompt {
  plaintext: string;
  ts?: string;
}

export function channelSummaryPrompt(
  alert: WebhookAlertDto,
  messageHistory: SlackMsgForPrompt[],
): string {
  return `You are a Slack channel context collector. Your task is to analyze the given message history based on a specific prompt and provide a concise summary of the relevant context.

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
`;
}

function formatSlackMessageForPrompt(msg: SlackMsgForPrompt): string {
  return `${convertSlackTimestamp(msg.ts!).toISOString()} Message: ${msg.plaintext}`;
}
