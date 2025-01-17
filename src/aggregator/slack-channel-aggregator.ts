import { CheckContext, ContextKey } from "./ContextAggregator";
import { WebhookAlertDto } from "../checkly/alertDTO";
import { generateChannelSummary } from "../slackbot/channel-summary";
import { Source } from "@prisma/client";

// List of channels to monitor
const RELEVANT_CHANNELS =
  process.env.SLACK_CHANNELS?.split(",").filter((id): id is string => !!id) ??
  [];

const makeChannelContext = (
  channelId: string,
  summary: string,
  relevantLinks: Array<{ url: string; title: string }>,
  checkId: string
): CheckContext => ({
  key: ContextKey.SlackChannelSummary.replace(
    "$channel",
    channelId
  ) as ContextKey,
  value: {
    summary,
    relevantLinks,
    channelId,
  },
  checkId,
  source: Source.custom,
  analysis: summary,
});

export const slackChannelAggregator = {
  name: "Slack Channel",
  fetchContext: async (alert: WebhookAlertDto): Promise<CheckContext[]> => {
    try {
      // Fetch summaries for all monitored channels in parallel
      const channelSummaries = await Promise.all(
        RELEVANT_CHANNELS.map(async (channelId) => {
          try {
            const { summary, relevantLinks } = await generateChannelSummary(
              channelId,
              "What are the recent events, discussions or relevant context related to the following alert?" +
              JSON.stringify({
                title: alert.ALERT_TITLE,
                type: alert.ALERT_TYPE,
                name: alert.CHECK_NAME,
                runLocation: alert.RUN_LOCATION,
                responseTime: alert.RESPONSE_TIME,
                tags: alert.TAGS,
              })
            );

            return makeChannelContext(
              channelId,
              summary,
              relevantLinks,
              alert.CHECK_ID
            );
          } catch (error) {
            console.error(
              `Error fetching summary for channel ${channelId}:`,
              error
            );
            return null;
          }
        })
      );

      // Filter out any failed channel summaries
      return channelSummaries.filter(
        (context): context is CheckContext => context !== null
      );
    } catch (error) {
      console.error("Error in Slack Channel aggregator:", error);
      return [];
    }
  },
};
