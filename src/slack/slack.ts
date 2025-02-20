import { WebClient } from "@slack/web-api";
import dotenv from "dotenv";

import { ConversationsHistoryResponse } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse";

export type SlackMessage = NonNullable<
  ConversationsHistoryResponse["messages"]
>[number];

dotenv.config();

export class SlackClient {
  private web: WebClient;

  constructor(authToken: string) {
    this.web = new WebClient(authToken);
  }

  async fetchHistoricalMessages(
    channelId: string,
    limit = 30,
    fromDate?: Date,
  ) {
    try {
      const result = await this.web.conversations.history({
        channel: channelId,
        limit: limit,
        ...(fromDate ? { oldest: (fromDate.getTime() / 1000).toString() } : {}),
      });

      if (!result.messages) {
        console.log("No messages in response");
        return [];
      }

      // Create a new cache for this request only
      const nameCache = new Map<string, Promise<string>>();

      return await Promise.all(
        result.messages.map(async (m) => ({
          ...m,
          plaintext: getMessageText(m),
          username: await this.fetchMessageSenderName(m, nameCache),
          timestamp: m.ts ? convertSlackTimestamp(m.ts) : null,
        })),
      );
    } catch (error) {
      console.error("Error fetching historical messages:", error);
      return [];
    }
  }

  private async fetchMessageSenderName(
    message: SlackMessage,
    nameCache: Map<string, Promise<string>>,
  ): Promise<string> {
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
      ? this.fetchUserName(message.user!)
      : this.fetchBotName(message.bot_id!);

    nameCache.set(cacheKey, namePromise);
    const name = await namePromise;
    return isUser ? `User/${name}` : `Bot/${name}`;
  }

  public async fetchUserName(userId: string): Promise<string> {
    try {
      const user = await this.web.users
        .info({ user: userId })
        .then((u) => u.user);
      return user?.profile?.display_name ?? userId;
    } catch (e) {
      console.error("error fetching user name", userId, e);
      return userId;
    }
  }

  public async fetchBotName(botId: string): Promise<string> {
    try {
      const bot = await this.web.bots.info({ bot: botId! });
      return bot.bot?.name ?? botId;
    } catch (e) {
      console.error("error fetching bot name", botId, e);
      return botId;
    }
  }

  async getTokenScopes() {
    const res = await this.web.auth.test();
    if (res.error) {
      throw res.error;
    }

    return res.response_metadata?.scopes;
  }
}

export const convertSlackTimestamp = (slackTs: string): Date => {
  // Slack timestamps are in the format "1234567890.123456"
  // The part before the dot is Unix seconds, after is microseconds
  const [seconds, microseconds] = slackTs.split(".");
  const milliseconds = parseInt(seconds) * 1000 + parseInt(microseconds) / 1000;
  return new Date(milliseconds);
};

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
