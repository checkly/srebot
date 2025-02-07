import { prisma } from "../prisma";
import { generateSlackMessageLink } from "./utils";
import { app } from "./app";
import { BotResponse, Feedback } from "@prisma/client";

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
  context: any,
  postMessageResponse: any,
) => {
  const whereClause = getWhereClause(postMessageResponse.message.metadata);

  await prisma.botResponse.create({
    data: {
      ...whereClause,
      content: postMessageResponse.message.text,
      slackMessageUrl: generateSlackMessageLink(
        postMessageResponse.channel!,
        postMessageResponse.message.thread_ts!,
      ),
      slackMessageTs: postMessageResponse.message.thread_ts,
    },
  });

  // Post another message with feedback buttons in the same thread
  // The message will be replaced with feedback result when a user submits it
  await app.client.chat.postMessage({
    token: context.botToken,
    channel: postMessageResponse.channel,
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

    thread_ts: postMessageResponse.message.thread_ts, // Replies in the same thread
    metadata: postMessageResponse.message.metadata,
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
