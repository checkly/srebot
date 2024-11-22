import { App, LogLevel } from "@slack/bolt";
import { getOpenaiClient, getOpenaiSDKClient } from "../ai/openai";
import { getRunMessages } from "../ai/utils";
import { SreAssistant } from "../sre-assistant/SreAssistant";
import GitHubAPI from "../github/github";
import { GithubAgent } from "../github/agent";
import moment from "moment";

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
	const CHECKLY_GITHUB_TOKEN = process.env.CHECKLY_GITHUB_TOKEN!;

	let openai = getOpenaiSDKClient();
	let github = new GitHubAPI(CHECKLY_GITHUB_TOKEN);

	return new GithubAgent(openai("gpt-4o"), github);
};

const githubAgent = setupAgent();

const releaseHeader = {
  "type": "section",
  "text": {
    "type": "mrkdwn",
    "text": "*Release Overview*"
  }
}

const divider = { type: "divider" };

const createReleaseBlock = function({release, releaseUrl, diffUrl, date, repo, repoUrl, authors, summary}: {release: string, releaseUrl: string, diffUrl: string, date: string, repo: string, repoUrl: string, authors: string[], summary: string}) {
  return {
    "blocks": [
      {
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "text": `:rocket: *Release*\n<${releaseUrl}|${release}> - <${diffUrl}|Diff>`
          },
          {
            "type": "mrkdwn",
            "text": `:calendar: *When*\n${date}`
          },
          {
            "type": "mrkdwn",
            "text": `:package: *Repo*\n<${repoUrl}|${repo}>`
          },
          {
            "type": "mrkdwn",
            "text": `:star: *Authors*\n${authors.join(', ')}`
          }
        ]
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*Summary*\n${summary}`
        }
      },
    ]
  };
}

app.command("/release", async ({ command, ack, respond }) => {
  await ack();
  let summaries = await githubAgent.summarizeReleases(command.text, 'checkly');
  if (summaries.releases.length === 0) {
    await respond({ text: `No releases found in repo ${summaries.repo} since ${summaries.since}`});
  }

  let releases = summaries.releases.sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime());  let response = [releaseHeader].concat(releases.map(summary => {
    const formattedDate = moment(summary.release_date).fromNow();
    return createReleaseBlock({ 
      release: summary.id, 
      releaseUrl: summary.link,
      diffUrl: summary.diffLink,
      date: formattedDate, 
      repo: summaries.repo.name, 
      repoUrl: summaries.repo.link, 
      authors: summary.authors.filter(author => author !== null).map(author => author.login), 
      summary: summary.summary 
    }).blocks as any;
  }).reduce((prev, curr) => {
    if (!prev) {
      return curr;
    }

    return prev.concat([divider]).concat(curr);
  }));

  await respond({
    blocks: response
  });
})

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

		const assistant = new SreAssistant(threadId, alertId, {
			username:
				event.user_profile?.display_name ||
				event.username ||
				event.user_profile?.name ||
				"Unknown User",
			date: new Date().toISOString(),
		});
		const userMessage = await assistant.addMessage(event.text);
		const responseMessages = await assistant
			.runSync()
			.then((run) => getRunMessages(threadId, run.id));

		const send = async (msg: string) => {
			app.client.chat.postMessage({
				token: context.botToken,
				channel: event.channel,
				text: msg,
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
