import { App, LogLevel } from "@slack/bolt";
import { getOpenaiClient } from "../ai/openai";
import { getRunMessages } from "../ai/utils";
import { SreAssistant } from "../sre-assistant/SreAssistant";

export const app = new App({
	signingSecret: process.env.SLACK_SIGNING_SECRET,
	token: process.env.SLACK_AUTH_TOKEN,
	appToken: process.env.SLACK_APP_TOKEN,
	socketMode: true,
	logLevel:
		process.env.NODE_ENV !== "production" ? LogLevel.DEBUG : LogLevel.INFO,
});

app.command("/help123", async ({ command, ack }) => {
	await ack();
	await app.client.chat.postEphemeral({
		channel: command.channel_id,
		text: "hey",
		user: command.user_id,
	});
});

app.message(`hey help`, async ({ message, context }) => {
	await app.client.chat.postEphemeral({
		channel: message.channel,
		text: "e",
		user: context.userId!,
	});
});

app.message("Hey SREBot", async ({ say }) => {
	await say("helloworld");
});

app.message("whatismyuserid", async ({ context, say }) => {
	await say(context.userId!);
});

let setupAgent = () => {
	const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
	const CHECKLY_GITHUB_TOKEN = process.env.CHECKLY_GITHUB_TOKEN!;

	let openai = createOpenAI({ apiKey: OPENAI_API_KEY });
	let github = new GitHubAPI(CHECKLY_GITHUB_TOKEN);

	return new GithubAgent(openai("gpt-4o"), github);
};

const githubAgent = setupAgent();

app.event("app_mention", async ({ event, context }) => {
	try {
		let threadId;
		let alertId = "test";

		if ((event as any).thread_ts) {
			try {
				const result = await app.client.conversations.replies({
					channel: event.channel,
					ts: (event as any).thread_ts,
					limit: 1,
					include_all_metadata: true,
				});
				if (result.messages && result.messages.length > 0) {
					const metadata = result.messages[0].metadata?.event_payload as {
						threadId: string;
						alertId: string;
					};

					threadId = metadata?.threadId;
					alertId = metadata?.alertId;
				}
			} catch (error) {
				console.error("Error fetching parent message:", error);
			}
		}

		if (!threadId) {
			const thread = await getOpenaiClient().beta.threads.create();
			threadId = thread.id;
		}

		const assistant = new SreAssistant(threadId, alertId);
		const userMessage = await assistant.addMessage(event.text);
		const responseMessages = await assistant
			.runSync()
			.then((run) => getRunMessages(threadId, run.id));

		const send = async (msg: string) => {
			app.client.chat.postMessage({
				token: context.botToken,
				channel: event.channel,
				blocks: [
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: msg,
						},
					},
				],
				thread_ts: (event as any).thread_ts || event.ts,
			});
		};

		await responseMessages.map((msg) =>
			send(
				msg.content
					.map((c) => (c.type === "text" ? c.text.value : ""))
					.join("\n")
			)
		);
	} catch (error) {
		console.error("Error reacting to mention:", error);
	}
});
