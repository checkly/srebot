import { generateObject } from "ai";
import { getOpenaiSDKClient } from "../ai/openai";
import { z } from "zod";

export const getThreadMetadata = async (messages: any[]) => {
	let threadId, alertId;

	if (messages && messages.length > 0) {
		const firstBotMessage = messages.find((msg) => msg.bot_id);
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

	// Replace HTML entities for special characters
	const htmlEntities = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
	};

	// Escape special characters first
	slackText = slackText.replace(/[&<>]/g, (char) => htmlEntities[char]);

	// Convert code blocks
	// Multi-line code blocks
	slackText = slackText.replace(/```([^`]+)```/g, "```$1```");

	// Inline code - need to handle this after multi-line to avoid conflicts
	slackText = slackText.replace(/`([^`]+)`/g, "`$1`");

	// Convert basic formatting
	// Bold: Convert both ** and __ to *
	slackText = slackText.replace(/(\*\*|__)(.*?)\1/g, "*$2*");

	// Italic: Convert both * and _ to _
	// We need to handle this carefully to not conflict with bold
	slackText = slackText.replace(/(\*|_)(.*?)\1/g, (match, wrapper, content) => {
		// Skip if it's part of a bold pattern
		if (wrapper === "*" && (content.startsWith("*") || content.endsWith("*"))) {
			return match;
		}
		return `_${content}_`;
	});

	// Strikethrough: Convert ~~ to ~
	slackText = slackText.replace(/~~(.*?)~~/g, "~$1~");

	// Convert blockquotes
	slackText = slackText.replace(/^>\s*(.*)$/gm, ">$1");

	// Convert links
	// Standard markdown links [text](url)
	slackText = slackText.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>");

	// Bare URLs - make sure they're properly formatted
	slackText = slackText.replace(/(?<!<)(https?:\/\/\S+)(?!>)/g, "<$1>");

	// Convert lists
	// Unordered lists: Convert *, +, or - to •
	slackText = slackText.replace(/^[\*\+\-]\s+(.*)$/gm, "• $1");

	// Ordered lists: Convert any number followed by . or ) to •
	slackText = slackText.replace(/^\d+[\.\)]\s+(.*)$/gm, "• $1");

	// Handle line breaks - Slack uses \n
	slackText = slackText.replace(/\r\n/g, "\n");

	return slackText;
}

export const slackFormatInstructions = `Format output as Slack mrkdwn messages using the following style: *bold*, <link|text>, _italics_, > quote, \`code\`, \`\`\`code block\`\`\`. It's important to use the correct syntax for the output to be rendered correctly. E.g. Important Link: <https://link.com|*Important Link*>.`;

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
