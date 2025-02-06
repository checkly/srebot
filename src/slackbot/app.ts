import { App } from "@slack/bolt";
import { getOpenaiClient, getOpenaiSDKClient } from "../ai/openai";
import { getRunMessages } from "../ai/utils";
import { SreAssistant } from "../sre-assistant/SreAssistant";
import { getSlackConfig, validateConfig } from "./config";
import { convertToSlackMarkdown, getMessageText, getThreadMetadata } from "./utils";
import GitHubAPI from "../github/github";
import { GithubAgent } from "../github/agent";
import moment from "moment";
import { createReleaseBlock, divider as releaseDivider, releaseHeader, } from "../github/slackBlock";
import { analyseAlert } from "./ops-channel/analyse-alert";
import { prisma } from "../prisma";
import { ContextKey } from "../aggregator/ContextAggregator";

// Initialize Slack app with validated configuration
const initializeSlackApp = () => {
  const config = getSlackConfig();
  validateConfig(config);
  return new App(config);
};

export const app = initializeSlackApp();

let setupAgent = () => {
  const CHECKLY_GITHUB_TOKEN = process.env.CHECKLY_GITHUB_TOKEN!;

  let openai = getOpenaiSDKClient();
  let github = new GitHubAPI(CHECKLY_GITHUB_TOKEN);

  return new GithubAgent(openai("gpt-4o"), github);
};

const githubAgent = setupAgent();

app.command("/srebot-releases", async ({ command, ack, respond }) => {
  await ack();
  let summaries = await githubAgent.summarizeReleases(command.text, "checkly");
  if (summaries.releases.length === 0) {
    await respond({
      text: `No releases found in repo ${summaries.repo.name} since ${summaries.since}`,
    });
  }

  let releases = summaries.releases.sort(
    (a, b) =>
      new Date(b.release_date).getTime() - new Date(a.release_date).getTime()
  );
  let response = [releaseHeader].concat(
    releases
      .map((summary) => {
        const date = moment(summary.release_date).fromNow();
        const authors = summary.authors
          .filter((author) => author !== null)
          .map((author) => author.login);
        return createReleaseBlock({
          release: summary.id,
          releaseUrl: summary.link,
          diffUrl: summary.diffLink,
          date,
          repo: summaries.repo.name,
          repoUrl: summaries.repo.link,
          authors,
          summary: summary.summary,
        }).blocks as any;
      })
      .reduce((prev, curr) => {
        if (!prev) {
          return curr;
        }

        return prev.concat([releaseDivider]).concat(curr);
      })
  );

  await respond({
    blocks: response,
  });
});

const pullNameFromMessage = (message) => {
  return message.username || message.bot_profile?.display_name || message.bot_profile?.name || message.user_profile?.display_name || message.user_profile?.name;
}

app.event("app_mention", async ({ event, context }) => {
  if (event.text.includes('srebot-replay-command') && event.thread_ts) {
    const threadMessages = await app.client.conversations.replies({
      token: context.botToken,
      channel: event.channel,
      ts: event.thread_ts, // Thread timestamp
    });
    const firstMessage = threadMessages.messages?.[0];
    if (!firstMessage) {
      return
    }

    const firstMessageText = getMessageText(firstMessage)
    const senderName = pullNameFromMessage(firstMessage)
    const messageTextWithSender = senderName
      ? `${senderName}: ${firstMessageText}`
      : firstMessageText

    console.log('Starting to analyse the alert message:', messageTextWithSender)

    const { responseText } = await getAlertAnalysis(messageTextWithSender, event.channel, event.thread_ts);

    await app.client.chat.postMessage({
      token: context.botToken,
      channel: event.channel,
      text: responseText,
      thread_ts: event.ts, // Replies in the same thread
    });
    return
  }

  try {
    let threadId, alertId;
    const threadTs = (event as any).thread_ts || event.ts;

    // Handle threaded conversations
    if ((event as any).thread_ts) {
      try {
        const result = await app.client.conversations.replies({
          channel: event.channel,
          ts: (event as any).thread_ts,
          include_all_metadata: true,
        });

        const { threadId: existingThreadId, alertId: existingAlertId } =
          await getThreadMetadata(result.messages || []);

        threadId = existingThreadId;
        alertId = existingAlertId;
      } catch (error) {
        console.error("Error fetching thread replies:", error);
      }
    }

    // Create new thread if needed
    if (!threadId) {
      const thread = await getOpenaiClient().beta.threads.create();
      threadId = thread.id;
    }

    // Initialize assistant and process message
    const assistant = new SreAssistant(threadId, alertId, {
      username:
        event.user_profile?.display_name ||
        event.username ||
        event.user_profile?.name ||
        "Unknown User",
      date: new Date().toISOString(),
    });

    await assistant.addMessage(event.text);
    const run = await assistant.runSync();
    const responseMessages = await getRunMessages(threadId, run.id);

    const sendMessage = (msg: string) =>
      app.client.chat.postMessage({
        token: context.botToken,
        channel: event.channel,
        text: convertToSlackMarkdown(msg),
        thread_ts: threadTs,
        ...(threadId && {
          metadata: {
            event_type: "alert",
            event_payload: { threadId },
          },
        }),
      });

    await Promise.all(
      responseMessages.map((msg) =>
        sendMessage(
          msg.content
            .filter((c) => c.type === "text")
            .map((c) => (c as any).text.value)
            .join("")
        )
      )
    );
  } catch (error) {
    console.error("Error processing app mention:", error);
    await app.client.chat.postMessage({
      token: context.botToken,
      channel: event.channel,
      text: "Sorry, I encountered an error while processing your request.",
      thread_ts: (event as any).thread_ts || event.ts,
    });
  }
});

async function getAlertAnalysis(messageText: string, targetChannel: string, threadTs: string) {
  console.log('Starting to analyse the alert message')
  const response = await analyseAlert(messageText, targetChannel, threadTs);
  let responseText;

  if (response.recommendation === 'ignore') {
    responseText = `The alert state is: \`${response.state}\`, and my recommendation is to ignore this message\n\nMy reasoning: ${response.reasoning}`
  } else {
    responseText = `I have determined that the alert is of severity: \`${response.severity}\``

    if (response.escalateToIncidentResponse && process.env.SLACK_USERS_TO_TAG) {
      const usersToTag = process.env.SLACK_USERS_TO_TAG.split(',').map(user => `<@${user}>`).join(' ')

      responseText += `( tagging ${usersToTag} for further investigation)`
    }

    if (response.affectedComponents && response.affectedComponents?.length > 0) {
      responseText += `\n\nAffected components:\n${response.affectedComponents?.map(affected => `- \`${affected.component}\` in \`${affected.environment}\` environment`).join('\n')}`
    }

    responseText += `\n\nSummary: ${response.summary}`

    if (response.historyOutput && response.historyOutput.type === "recurring" && response.historyOutput.confidence >= 80) {
      responseText += `\n\nHere is the history of similar alerts in the past 72h:\n${response.historyOutput.pastMessageLinks.slice(0, 5).join('\n')}`
    }
    if (response.historyOutput && response.historyOutput.type === "escalating") {
      responseText += `\n\nIt looks like the alert is escalating from it's normal rate in the last 72h:\n${response.historyOutput.pastMessageLinks.slice(0, 5).join('\n')}`
    }
    if (response.historyOutput && response.historyOutput.type === "new") {
      responseText += '\n\nIt looks like a new issue, I could not find any similar alerts in the past 72h.'
    }
  }
  return { responseText, response };
}

if (process.env.OPS_CHANNEL_ID) {
  const targetChannel = process.env.OPS_CHANNEL_ID;

  // Listen for messages in the specified channel
  app.event("message", async ({ event, context }: { event: any, context: any }) => {
    try {
      const isTargetChannel = event.channel === targetChannel;
      const isNotAThreadReply = !event.thread_ts; // not a openAIThread reply
      const isMessageEvent = event.type === "message"; // Ignore message edits
      const isNotMessageChangedEvent = event.subtype !== "message_changed"; // Ignore message edits

      const shouldRespondToMessage = isTargetChannel && isNotAThreadReply && isMessageEvent && isNotMessageChangedEvent;
      if (!shouldRespondToMessage) {
        return
      }

      const messageText = getMessageText(event);
      const sender = pullNameFromMessage(event);
      const messageTextWithSender = sender
        ? `${sender}: ${messageText}`
        : messageText

      // @ts-ignore
      console.log("Received message:", messageText, "from:", sender as any);

      const isLikelyFromBot = event.subtype === "bot_message" || Boolean(event.bot_id);
      const isMessageFromHuman = !isLikelyFromBot;

      const shouldIgnoreMessageBasedOnSender = isMessageFromHuman && process.env.ALLOW_NON_BOT_MESSAGES === undefined;
      if (shouldIgnoreMessageBasedOnSender) {
        console.log("Ignoring message from non-bot user. If you want to allow messages from non-bot users, set ALLOW_NON_BOT_MESSAGES=true in your environment variables. Event subtype:", event.subtype);
        return;
      }

      const { responseText, response } = await getAlertAnalysis(messageTextWithSender, targetChannel, event.ts);

      const alertRecord = await prisma.alert.create({
        data: {
          summary: response.summary || 'No summary',
          data: {
            message: messageText,
            sender: sender,
            channel: event.channel
          },
          context: {
            createMany: {
              data: {
                key: ContextKey.AlertAnalysis,
                value: response
              }
            }
          }
        },
      });

      const openAIThread = await getOpenaiClient().beta.threads.create({
        messages: [
          {
            role: "assistant",
            content:
              `*Alert:* ${messageTextWithSender}\n\n*Summary:* ${response.summary}`,
          },
        ],
      });

      await app.client.chat.postMessage({
        token: context.botToken,
        channel: event.channel,
        text: responseText,
        thread_ts: event.ts, // Replies in the same thread
        metadata: {
          event_type: "alert",
          event_payload: {
            threadId: openAIThread.id,
            alertId: alertRecord.id,
          },
        },
      });
    } catch (error) {
      console.error("Error responding to message:", error);
    }
  });
}
