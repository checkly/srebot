import { generateObject } from "ai";
import { WebhookAlertDto } from "../checkly/alertDTO";
import { channelSummaryPrompt, ChannelSummaryResponse } from "../prompts/slack";
import { SlackClient } from "../slack/slack";

const slackClient = new SlackClient(process.env.SLACK_AUTH_TOKEN || "");

export const generateChannelSummary = async (
  channelId: string,
  alert: WebhookAlertDto,
  fromTimestamp?: string,
): Promise<ChannelSummaryResponse> => {
  const fromDate = fromTimestamp
    ? new Date(fromTimestamp)
    : new Date(Date.now() - 1000 * 60 * 60 * 24);

  const messages = await slackClient.fetchHistoricalMessages(
    channelId,
    100,
    fromDate,
  );

  const promptDefinition = channelSummaryPrompt(alert, messages);

  const { object } = await generateObject(promptDefinition);

  return object;
};
