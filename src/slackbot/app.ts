import { App } from "@slack/bolt";
import { getOpenaiClient, getOpenaiSDKClient } from "../ai/openai";
import { getRunMessages } from "../ai/utils";
import { SreAssistant } from "../sre-assistant/SreAssistant";
import { getSlackConfig, validateConfig } from "./config";
import { getThreadMetadata } from "./utils";
import GitHubAPI from "../github/github";
import { GithubAgent } from "../github/agent";
import moment from "moment";
import {
	createReleaseBlock,
	divider as releaseDivider,
	releaseHeader,
} from "../github/slackBlock";

// Initialize Slack app with validated configuration
const initializeSlackApp = () => {
	const config = getSlackConfig();
	validateConfig(config);
	return new App(config);
};

let org = process.env.GITHUB_ORG!;
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

		const sendMessage = (msg: string) =>
			app.client.chat.postMessage({
				token: context.botToken,
				channel: event.channel,
				text: msg.replace(/(\*\*|__)(.*?)\1/g, "*$2*"),
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
