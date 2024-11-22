import { App } from "@slack/bolt";
import { getOpenaiClient, getOpenaiSDKClient } from "../ai/openai";
import { getRunMessages } from "../ai/utils";
import { SreAssistant } from "../sre-assistant/SreAssistant";
import { getSlackConfig, validateConfig } from "./config";
import { getThreadMetadata } from "./utils";

// Initialize Slack app with validated configuration
const initializeSlackApp = () => {
	const config = getSlackConfig();
	validateConfig(config);
	return new App(config);
};

export const app = initializeSlackApp();

// Event handling
app.event("app_mention", async ({ event, context }) => {
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

		// Send responses
		const sendMessage = (msg: string) =>
			app.client.chat.postMessage({
				token: context.botToken,
				channel: event.channel,
				text: msg,
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
		// Send error message to channel
		await app.client.chat.postMessage({
			token: context.botToken,
			channel: event.channel,
			text: "Sorry, I encountered an error while processing your request.",
			thread_ts: (event as any).thread_ts || event.ts,
		});
	}
});
