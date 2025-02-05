import { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse";
import { generateObject } from "ai";
import { z } from "zod";
import { getOpenaiSDKClient } from "../ai/openai";
import { web } from "./web-client";

export const getThreadMetadata = async (messages: any[]) => {
  let threadId, alertId;

  if (messages && messages.length > 0) {
    const firstBotMessage = messages.find((msg) => msg.bot_id && (msg.metadata?.event_payload?.threadId || msg.metadata?.event_payload?.alertId));
    if (firstBotMessage) {
      const metadata = firstBotMessage.metadata?.event_payload as {
        threadId: string;
        alertId: string;
      };
      threadId = metadata?.threadId;
      alertId = metadata?.alertId;
    }
  }

  return { threadId, alertId };
};

export function convertToSlackMarkdown(markdown: string) {
  if (!markdown) return "";

  let slackText = markdown;

  // Convert basic formatting
  // Bold: Convert **text** to *text* and __text__ to *text*
  slackText = slackText.replace(/(\*\*|__)(.*?)\1/g, "*$2*");

  // Strikethrough: Convert ~~ to ~
  slackText = slackText.replace(/~~(.*?)~~/g, "~$1~");

  // Convert links
  // Standard markdown links [text](url)
  slackText = slackText.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>");

  return slackText;
}

export const slackFormatInstructions = `Format all output in Slack mrkdwn format. Generate Slack messages using the following style: *bold*, <link|text>, _italics_, > quote, \`code\`, \`\`\`code block\`\`\`. It's important to use the correct syntax for the output to be rendered correctly. E.g. Important Link: <https://link.com|*Important Link*>.`;

export async function generateSlackBlockKitMessage(message: string) {
  const { object: blocks } = await generateObject({
    model: getOpenaiSDKClient()("gpt-4o"),
    schema: z.object({
      blocks: z
        .array(
          z.union([
            z
              .object({
                type: z.literal("header"),
                text: z.object({
                  type: z.literal("plain_text"),
                  text: z.string(),
                }),
              })
              .describe("A header block"),
            z
              .object({
                type: z.literal("section"),
                fields: z
                  .array(
                    z.object({
                      type: z.literal("mrkdwn"),
                      text: z.string(),
                    })
                  )
                  .describe("The fields of the section block"),
              })
              .describe("A section block with fields"),
            z
              .object({
                type: z.literal("section"),
                text: z.object({
                  type: z.literal("mrkdwn"),
                  text: z.string(),
                }),
              })
              .describe("A section block with markdown text"),
            z
              .object({
                type: z.literal("divider"),
              })
              .describe("A divider block"),
            z
              .object({
                type: z.literal("actions"),
                elements: z
                  .array(
                    z.object({
                      type: z.literal("button"),
                      text: z.object({
                        type: z.literal("plain_text"),
                        text: z
                          .string()
                          .describe("The text of the quick reply button"),
                      }),
                      value: z
                        .string()
                        .describe(
                          "The value of the quick reply button. This will be sent to the chat as a user message when the button is clicked."
                        ),
                      action_id: z
                        .string()
                        .describe(
                          "The action ID of the quick reply button. This should be quick-reply-<number>"
                        ),
                    })
                  )
                  .describe("The elements of the quick reply actions block"),
              })
              .describe("An actions block with quick reply buttons"),
          ])
        )
        .describe("The blocks of the Slack Block Kit message"),
    }),
    experimental_telemetry: {
      isEnabled: true,
    },
    prompt: `Some example Slack Block Kit messages:

{
	"blocks": [
		{
			"type": "header",
			"text": {
				"type": "plain_text",
				"text": "Alert: "
			}
		},
		{
			"type": "section",
			"fields": [
				{
					"type": "mrkdwn",
					"text": "*Check:*\n<https://link.com|name>"
				},
				{
					"type": "mrkdwn",
					"text": "*Result:*\n<https://link.com|open>"
				},
				{
					"type": "mrkdwn",
					"text": "*Failure Location:*\nEU West (\`eu-west-1\`)"
				},
				{
					"type": "mrkdwn",
					"text": "*Response Time:*\n33 ms"
				},
				{
					"type": "mrkdwn",
					"text": "*Attempts:*\n2"
				},
				{
					"type": "mrkdwn",
					"text": "*Errors Logged:*\nNone"
				}
			]
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": "*Summary:*\nThe failure was unexpected, and while the response time was quick, the check still failed. Given that no errors were logged, this might suggest an issue not directly related to response time or standard application errors, possibly related to a network or connectivity issue."
			}
		},
		{
			"type": "actions",
			"elements": [
				{
					"type": "button",
					"text": {
						"type": "plain_text",
						"text": "Analyze tcpdump"
					},
					"value": "Analyze the tcpdump file for unusual patterns",
					"action_id": "quick-reply-1"
				},
				{
					"type": "button",
					"text": {
						"type": "plain_text",
						"text": "Review GitHub Commits"
					},
					"value": "Review recent commits on relevant repositories",
					"action_id": "quick-reply-2"
				},
				{
					"type": "button",
					"text": {
						"type": "plain_text",
						"text": "Examine S3 Logs"
					},
					"value": "Examine AWS S3 logs for unusual activity",
					"action_id": "quick-reply-3"
				}
			]
		}
	]
}

Only use the slack mrkdwn format for text: *bold*, ~strikethrough~, <link|text>, * bullet points, and _italics_.
Generate a Slack Block Kit message from the following content:
${message}`,
  });

  return blocks;
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
    (text) => text.trim().length > 0
  );

  // Join all parts with newlines and trim whitespace
  return uniqueTextParts.join("\n").trim();
};

export async function fetchHistoricalMessages(
  channelId: string,
  limit = 30,
  fromDate?: Date
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
      }))
    );
  } catch (error) {
    console.error("Error fetching historical messages:", error);
    return [];
  }
}

export const convertSlackTimestamp = (slackTs: string): Date => {
  // Slack timestamps are in the format "1234567890.123456"
  // The part before the dot is Unix seconds, after is microseconds
  const [seconds, microseconds] = slackTs.split(".");
  const milliseconds = parseInt(seconds) * 1000 + parseInt(microseconds) / 1000;
  return new Date(milliseconds);
};

const fetchUserName = async (userId: string): Promise<string> => {
  try {
    const user = await web.users
      .info({ user: userId })
      .then((u) => u.user);
    return user?.name ?? user?.real_name ?? userId;
  } catch (e) {
    return userId;
  }
}

const fetchBotName = async (botId: string): Promise<string> => {
  try {
    const bot = await web.bots.info({ bot: botId! });
    return bot.bot?.name ?? botId;
  } catch (e) {
    return botId;
  }
}

export const fetchMessageSenderName = async (message: MessageElement, nameCache: Map<string, Promise<string>>): Promise<string> => {
  const isUser = Boolean(message.user);

  if (message.username) {
    return isUser
      ? `User/${message.username}`
      : `Bot/${message.username}`;
  }

  const cacheKey = isUser
    ? `user:${message.user}`
    : `bot:${message.bot_id}`

  const promise = nameCache.get(cacheKey);
  if (promise) {
    return promise;
  }

  const namePromise = isUser
    ? fetchUserName(message.user!)
    : fetchBotName(message.bot_id!)

  nameCache.set(cacheKey, namePromise);
  const name = await namePromise;
  return isUser
    ? `User/${name}`
    : `Bot/${name}`;
};
