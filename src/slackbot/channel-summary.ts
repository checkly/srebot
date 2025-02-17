import { generateObject } from "ai";
import { z } from "zod";
import { WebhookAlertDto } from "../checkly/alertDTO";
import { channelSummaryPrompt } from "../prompts/slack";
import { SlackClient } from "../slack/slack";

const slackClient = new SlackClient(process.env.SLACK_AUTH_TOKEN || "");

export const generateChannelSummary = async (
  channelId: string,
  alert: WebhookAlertDto,
  fromTimestamp?: string,
) => {
  const fromDate = fromTimestamp
    ? new Date(fromTimestamp)
    : new Date(Date.now() - 1000 * 60 * 60 * 24);
  const messages = await slackClient.fetchHistoricalMessages(
    channelId,
    100,
    fromDate,
  );

  const [prompt, config] = channelSummaryPrompt(alert, messages);

  const {
    object: { summary, relevantLinks },
  } = await generateObject({
    ...config,
    prompt,
    schema: z.object({
      summary: z
        .string()
        .describe(`Concise summary based on the following question: ${prompt}`),
      relevantLinks: z
        .array(z.object({ url: z.string(), title: z.string() }))
        .describe(
          "Links that are relevant to the given question or the channel summary.",
        ),
    }),
  });

  return { summary, relevantLinks };
};
