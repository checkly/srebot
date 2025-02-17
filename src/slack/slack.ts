import { WebClient } from "@slack/web-api";
import dotenv from "dotenv";

import { ConversationsHistoryResponse } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse";

export type SlackMessage = NonNullable<
  ConversationsHistoryResponse["messages"]
>[number];

dotenv.config();

export const web = new WebClient(process.env.SLACK_AUTH_TOKEN);

export async function fetchHistoricalMessages(
  channelId: string,
  limit = 30,
  fromDate?: Date,
) {
  try {
    const result = await web.conversations.history({
      channel: channelId,
      limit: limit,
      ...(fromDate ? { oldest: (fromDate.getTime() / 1000).toString() } : {}),
    });

    if (!result.messages) {
      console.log("No messages in response");
      return [];
    }

    const nameCache = new Map<string, Promise<string>>();

    console.log(`Found ${result.messages.length} messages`);
    return await Promise.all(
      result.messages.map(async (m) => ({
        ...m,
        plaintext: getMessageText(m),
        username: await fetchMessageSenderName(m, nameCache),
      })),
    );
  } catch (error) {
    console.error("Error fetching historical messages:", error);
    return [];
  }
}

export const getMessageText = (message: Object): string => {
  const textParts: string[] = [];

  // Helper function to extract text from any object that might contain text
  const extractText = (obj: any) => {
    if (!obj) return;

    // Handle direct text properties
    if (typeof obj === "string") {
      textParts.push(obj);
      return;
    }

    // Handle text property
    if (obj.text) {
      if (typeof obj.text === "string") {
        textParts.push(obj.text);
      } else if (typeof obj.text === "object") {
        extractText(obj.text);
      }
    }

    // Handle rich text elements
    if (obj.elements && Array.isArray(obj.elements)) {
      obj.elements.forEach((element) => extractText(element));
    }

    // Handle fields in sections
    if (obj.fields && Array.isArray(obj.fields)) {
      obj.fields.forEach((field) => extractText(field));
    }

    // Handle blocks (can be at message level or in attachments)
    if (obj.blocks && Array.isArray(obj.blocks)) {
      obj.blocks.forEach((block) => extractText(block));
    }

    // Handle attachments
    if (obj.attachments && Array.isArray(obj.attachments)) {
      obj.attachments.forEach((attachment) => {
        if (attachment.pretext) textParts.push(attachment.pretext);
        if (attachment.title) textParts.push(attachment.title);
        if (attachment.fallback) textParts.push(attachment.fallback);
        extractText(attachment);
      });
    }

    // Handle values (like in buttons)
    if (obj.value) {
      textParts.push(obj.value);
    }
  };

  // Start extraction from the root message
  extractText(message);

  // Remove any duplicate entries and empty strings
  const uniqueTextParts = [...new Set(textParts)].filter(
    (text) => text.trim().length > 0,
  );

  // Join all parts with newlines and trim whitespace
  return uniqueTextParts.join("\n").trim();
};

export const fetchMessageSenderName = async (
  message: SlackMessage,
  nameCache: Map<string, Promise<string>>,
): Promise<string> => {
  const isUser = Boolean(message.user);

  if (message.username) {
    return isUser ? `User/${message.username}` : `Bot/${message.username}`;
  }

  const cacheKey = isUser ? `user:${message.user}` : `bot:${message.bot_id}`;

  const promise = nameCache.get(cacheKey);
  if (promise) {
    return promise;
  }

  const namePromise = isUser
    ? fetchUserName(message.user!)
    : fetchBotName(message.bot_id!);

  nameCache.set(cacheKey, namePromise);
  const name = await namePromise;
  return isUser ? `User/${name}` : `Bot/${name}`;
};

const fetchUserName = async (userId: string): Promise<string> => {
  try {
    const user = await web.users.info({ user: userId }).then((u) => u.user);
    return user?.name ?? user?.real_name ?? userId;
  } catch (e) {
    return userId;
  }
};

const fetchBotName = async (botId: string): Promise<string> => {
  try {
    const bot = await web.bots.info({ bot: botId! });
    return bot.bot?.name ?? botId;
  } catch (e) {
    return botId;
  }
};
