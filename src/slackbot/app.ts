import { App } from "@slack/bolt";
import moment from "moment";
import { ContextKey } from "../aggregator/ContextAggregator";
import { getOpenaiClient, getOpenaiSDKClient } from "../ai/openai";
import { getRunMessages } from "../ai/utils";
import { GithubAgent } from "../github/agent";
import GitHubAPI from "../github/github";
import {
  createReleaseBlock,
  divider as releaseDivider,
  releaseHeader,
} from "../github/slackBlock";
import { prisma } from "../prisma";
import { SreAssistant } from "../sre-assistant/SreAssistant";
import { getSlackConfig, validateConfig } from "./config";
import { analyseAlert } from "./ops-channel/analyse-alert";
import { convertToSlackMarkdown, getThreadMetadata } from "./utils";
import { getMessageText } from "../slack/slack";
import {
  FeedbackScore,
  saveResponseAndAskForFeedback,
  saveResponseFeedback,
} from "./feedback";
import type { ChatPostMessageResponse } from "@slack/web-api/dist/types/response";
import {
  CHECKLY_COMMAND_NAME as CHECKLY_COMMAND_NAME,
  checklyCommandHandler,
} from "./checkly";
import { listFailingChecksActionHandler } from "./listFailingChecksActionHandler";
import { listErrorPatternActionHandler } from "./listErrorPatternActionHandler";
import { LIST_ERROR_PATTERNS_ACTION_ID } from "./blocks/errorPatternBlock";
import { LIST_FAILING_CHECKS_ACTION_ID } from "./blocks/failingChecksBlock";
import { NOOP_ACTION_ID, noopActionHandler } from "./noopActionHandler";
// Initialize Slack app with validated configuration
const initializeSlackApp = () => {
  const config = getSlackConfig();
  validateConfig();
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

app.command(CHECKLY_COMMAND_NAME, checklyCommandHandler(app));
app.action(LIST_FAILING_CHECKS_ACTION_ID, listFailingChecksActionHandler(app));
app.action(LIST_ERROR_PATTERNS_ACTION_ID, listErrorPatternActionHandler(app));
app.action(NOOP_ACTION_ID, noopActionHandler());

app.command("/srebot-releases", async ({ command, ack, respond }) => {
  await ack();
  const summaries = await githubAgent.summarizeReleases(
    command.text,
    "checkly",
  );
  if (summaries.releases.length === 0) {
    await respond({
      text: `No releases found in repo ${summaries.repo.name} since ${summaries.since}`,
    });
  }

  const releases = summaries.releases.sort(
    (a, b) =>
      new Date(b.release_date).getTime() - new Date(a.release_date).getTime(),
  );
  const response = [releaseHeader].concat(
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
      }),
  );

  await respond({
    blocks: response,
  });
});

const pullNameFromMessage = (message) => {
  return (
    message.username ||
    message.bot_profile?.display_name ||
    message.bot_profile?.name ||
    message.user_profile?.display_name ||
    message.user_profile?.name
  );
};

app.event("app_mention", async ({ event, context }) => {
  if (event.text.includes("srebot-replay-command") && event.thread_ts) {
    const threadMessages = await app.client.conversations.replies({
      token: context.botToken,
      channel: event.channel,
      ts: event.thread_ts, // Thread timestamp
    });
    const firstMessage = threadMessages.messages?.[0];
    if (!firstMessage) {
      return;
    }

    const firstMessageText = getMessageText(firstMessage);
    const senderName = pullNameFromMessage(firstMessage);
    const messageTextWithSender = senderName
      ? `${senderName}: ${firstMessageText}`
      : firstMessageText;

    console.log(
      "Starting to analyse the alert message:",
      messageTextWithSender,
    );

    const { responseText } = await getAlertAnalysis(
      messageTextWithSender,
      event.channel,
      event.thread_ts,
    );

    await app.client.chat.postMessage({
      token: context.botToken,
      channel: event.channel,
      text: responseText,
      thread_ts: event.ts, // Replies in the same thread
    });
    return;
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
            .join(""),
        ),
      ),
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

async function getAlertAnalysis(
  messageText: string,
  targetChannel: string,
  threadTs: string,
) {
  console.log("Starting to analyse the alert message");
  const response = await analyseAlert(messageText, targetChannel, threadTs);
  let responseText;

  if (response.recommendation === "ignore") {
    responseText = `The alert state is: \`${response.state}\`, and my recommendation is to ignore this message\n\nMy reasoning: ${response.reasoning}`;
  } else {
    responseText = `I have determined that the alert is of severity: \`${response.severity}\``;

    if (response.escalateToIncidentResponse && process.env.SLACK_USERS_TO_TAG) {
      const usersToTag = process.env.SLACK_USERS_TO_TAG.split(",")
        .map((user) => `<@${user}>`)
        .join(" ");

      responseText += `( tagging ${usersToTag} for further investigation)`;
    }

    if (
      response.affectedComponents &&
      response.affectedComponents?.length > 0
    ) {
      responseText += `\n\nAffected components:\n${response.affectedComponents
        ?.map(
          (affected) =>
            `- \`${affected.component}\` in \`${affected.environment}\` environment`,
        )
        .join("\n")}`;
    }

    responseText += `\n\nSummary: ${response.summary}`;

    if (
      response.historyOutput &&
      response.historyOutput.type === "recurring" &&
      response.historyOutput.confidence >= 80
    ) {
      responseText += `\n\nHere is the history of similar alerts in the past 72h:\n${response.historyOutput.pastMessageLinks
        .slice(0, 5)
        .join("\n")}`;
    }
    if (
      response.historyOutput &&
      response.historyOutput.type === "escalating"
    ) {
      responseText += `\n\nIt looks like the alert is escalating from it's normal rate in the last 72h:\n${response.historyOutput.pastMessageLinks
        .slice(0, 5)
        .join("\n")}`;
    }
    if (response.historyOutput && response.historyOutput.type === "new") {
      responseText +=
        "\n\nIt looks like a new issue, I could not find any similar alerts in the past 72h.";
    }
  }
  return { responseText, response };
}

if (process.env.OPS_CHANNEL_ID) {
  const targetChannel = process.env.OPS_CHANNEL_ID;

  // Listen for messages in the specified channel
  app.event(
    "message",
    async ({ event, context }: { event: any; context: any }) => {
      try {
        const isTargetChannel = event.channel === targetChannel;
        const isNotAThreadReply = !event.thread_ts; // not a openAIThread reply
        const isMessageEvent = event.type === "message"; // Ignore message edits
        const isNotMessageChangedEvent = event.subtype !== "message_changed"; // Ignore message edits

        // FIXME enable bot again at some point (al)
        const shouldRespondToMessage = false;
        // isTargetChannel &&
        // isNotAThreadReply &&
        // isMessageEvent &&
        // isNotMessageChangedEvent;
        if (!shouldRespondToMessage) {
          return;
        }

        const messageText = getMessageText(event);
        const sender = pullNameFromMessage(event);
        const messageTextWithSender = sender
          ? `${sender}: ${messageText}`
          : messageText;

        // @ts-ignore
        console.log("Received message:", messageText, "from:", sender as any);

        const isLikelyFromBot =
          event.subtype === "bot_message" || Boolean(event.bot_id);
        const isMessageFromHuman = !isLikelyFromBot;

        const shouldIgnoreMessageBasedOnSender =
          isMessageFromHuman &&
          process.env.ALLOW_NON_BOT_MESSAGES === undefined;
        if (shouldIgnoreMessageBasedOnSender) {
          console.log(
            "Ignoring message from non-bot user. If you want to allow messages from non-bot users, set ALLOW_NON_BOT_MESSAGES=true in your environment variables. Event subtype:",
            event.subtype,
          );
          return;
        }

        const { responseText, response } = await getAlertAnalysis(
          messageTextWithSender,
          targetChannel,
          event.ts,
        );

        const alertRecord = await prisma.alert.create({
          data: {
            summary: response.summary || "No summary",
            data: {
              message: messageText,
              sender: sender,
              channel: event.channel,
            },
            context: {
              createMany: {
                data: {
                  key: ContextKey.AlertAnalysis,
                  value: response,
                },
              },
            },
          },
        });

        const openAIThread = await getOpenaiClient().beta.threads.create({
          messages: [
            {
              role: "assistant",
              content: `*Alert:* ${messageTextWithSender}\n\n*Summary:* ${response.summary}`,
            },
          ],
        });

        const postMessageResponse: ChatPostMessageResponse =
          await app.client.chat.postMessage({
            token: context.botToken,
            channel: event.channel,
            text: responseText,
            thread_ts: event.ts, // Replies in the same thread
            metadata: {
              // This metadata will be used to identify message for feedback purposes
              event_type: "alert",
              event_payload: {
                threadId: openAIThread.id,
                alertId: alertRecord.id,
              },
            },
          });

        await saveResponseAndAskForFeedback(postMessageResponse);
      } catch (error) {
        console.error("Error responding to message:", error);
      }
    },
  );
}

app.action("feedback_thumbs_up", async ({ body, ack, respond }: any) => {
  await ack();
  const userId = body.user.id;

  const feedbackRecord = await saveResponseFeedback(
    body.message.metadata,
    FeedbackScore.thumbsUp,
  );
  if (!feedbackRecord) {
    console.log(
      `msg="Feedback thumbs up ignored" user=${userId} error="No related response found"`,
    );
    return;
  }

  console.log(
    `msg="Feedback thumbs up received" user=${userId} sre_bot_response_id=${feedbackRecord.botResponseId}`,
  );

  await respond({
    text: `*Thank you for the :thumbsup: feedback <@${body.user.id}>!*`,
    replace_original: true,
  });
});

app.action("feedback_thumbs_down", async ({ body, ack, respond }: any) => {
  await ack();
  const userId = body.user.id;

  const feedbackRecord = await saveResponseFeedback(
    body.message.metadata,
    FeedbackScore.thumbsDown,
  );
  if (!feedbackRecord) {
    console.log(
      `msg="Feedback thumbs down ignored" user=${userId} error="No related response found"`,
    );
    return;
  }

  console.log(
    `msg="Feedback thumbs down received" user=${userId} sre_bot_response_id=${feedbackRecord.botResponseId}`,
  );

  const text = `Thanks for your :thumbsdown: feedback, <@${userId}>!\nCould you tell us why this wasn’t helpful? Select all that apply below.`;

  await respond({
    text,
    replace_original: true,
    metadata: body.message.metadata, // Pass metadata so that the feedback_reasons_submit can use it to find related response
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "checkboxes",
            action_id: "feedback_reasons_submit",
            options: [
              {
                text: {
                  type: "mrkdwn",
                  text: "Incorrect info / hallucinations",
                },
                value: "incorrect_info",
              },
              {
                text: {
                  type: "mrkdwn",
                  text: "Too vague / missing details",
                },
                value: "vague",
              },
              {
                text: {
                  type: "mrkdwn",
                  text: "Irrelevant / off-topic ",
                },
                value: "irrelevant",
              },
              {
                text: {
                  type: "mrkdwn",
                  text: "Too long / hard to read",
                },
                value: "long",
              },
              {
                text: {
                  type: "mrkdwn",
                  text: "Other",
                },
                // We can use other to capture any other feedback reasons.
                // We can actually implement it if once we see that users are using it.
                value: "other",
              },
            ],
          },
        ],
      },
    ],
  });
});

app.action("feedback_reasons_submit", async ({ body, ack }: any) => {
  await ack();

  const categories = body.actions[0].selected_options.map((opt) => opt.value);
  const userId = body.user.id;
  if (categories.length === 0) {
    console.log(
      `msg="Feedback reasons ignored" user=${userId} error="No feedback reasons selected"`,
    );
    return;
  }
  const messageMetadata = body.message.metadata;
  const feedbackRecord = await saveResponseFeedback(
    messageMetadata,
    FeedbackScore.thumbsDown,
    categories,
  );

  if (!feedbackRecord) {
    console.log(
      `msg="Feedback reasons ignored" user=${userId} error="No related response found"`,
    );
    return;
  }
  console.log(
    `msg="Feedback thumbs down categories received" user=${userId} sre_bot_response_id=${feedbackRecord.botResponseId} categories=${categories.join(",")}`,
  );
});
