import { prisma } from "../prisma";
import { generateSlackMessageLink, getMessageText } from "./utils";
import { app } from "./app";
import { BotResponse, Feedback } from "@prisma/client";
import type { ChatPostMessageResponse } from "@slack/web-api/dist/types/response";

type BotResponseWhereClause = {
  alertId?: string;
  releaseId?: string;
  deploymentId?: string;
};

const getWhereClause = (metadata: any): BotResponseWhereClause => {
  const whereClause: BotResponseWhereClause = {};
  if (metadata.event_type === "alert") {
    whereClause.alertId = metadata.event_payload?.alertId;
  }
  if (metadata.event_type === "release") {
    whereClause.releaseId = metadata.event_payload?.releaseId;
  }
  if (metadata.event_type === "deployment") {
    whereClause.deploymentId = metadata.event_payload?.deploymentId;
  }
  return whereClause;
};

async function findBotResponse(metadata: any): Promise<BotResponse | null> {
  const whereClause = getWhereClause(metadata);

  return prisma.botResponse.findFirst({
    where: whereClause,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export const saveResponseAndAskForFeedback = async (
  postMessageResponse: ChatPostMessageResponse,
) => {
  const message = postMessageResponse.message!;
  const whereClause = getWhereClause(message.metadata);
  const channel = postMessageResponse.channel!;
  const threadTs = message.thread_ts || postMessageResponse.ts;
  const messageText = getMessageText(message);

  await prisma.botResponse.create({
    data: {
      ...whereClause,
      content: messageText,
      slackMessageUrl: generateSlackMessageLink(channel!, threadTs!),
      slackMessageTs: threadTs!,
    },
  });

  // Post another message with feedback buttons in the same thread
  // The message will be replaced with feedback result when a user submits it
  await app.client.chat.postMessage({
    channel,
    text: "Was this helpful?",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Was this helpful?",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: "feedback_thumbs_up",
            text: {
              type: "plain_text",
              text: "👍",
            },
            style: "primary",
          },
          {
            type: "button",
            action_id: "feedback_thumbs_down",
            text: {
              type: "plain_text",
              text: "👎",
            },
            style: "danger",
          },
        ],
      },
    ],

    thread_ts: threadTs, // Replies in the same thread
    metadata: message.metadata! as any,
  });
};

export enum FeedbackScore {
  thumbsUp = 1,
  thumbsDown = 0,
}

export const saveResponseFeedback = async (
  metadata: any,
  score: FeedbackScore,
  categories: string[] = [],
): Promise<Feedback | null> => {
  const responseRecord = await findBotResponse(metadata);
  if (!responseRecord) {
    return null;
  }
  const botResponseId = responseRecord.id;

  return prisma.feedback.upsert({
    where: {
      botResponseId,
    },
    create: {
      botResponseId,
      score,
      categories,
    },
    update: {
      score,
      categories,
    },
  });
};
