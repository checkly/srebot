import { createOpenAI } from '@ai-sdk/openai';
import { App, LogLevel } from '@slack/bolt';
import { GithubAgent } from '../github/agent';
import GitHubAPI from '../github/github';
import moment from 'moment';

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
export const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_AUTH_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel:
    process.env.NODE_ENV !== 'production' ? LogLevel.DEBUG : LogLevel.INFO,
});

app.command('/help', async ({ command, ack }) => {
  await ack();
  await app.client.chat.postEphemeral({
    channel: command.channel_id,
    text: 'hey',
    user: command.user_id,
  });
});

app.message(`hey help`, async ({ message, context }) => {
  await app.client.chat.postEphemeral({
    channel: message.channel,
    text: 'e',
    user: context.userId!,
  });
});

app.message('Hey SREBot', async ({ say }) => {
  await say('helloworld');
});

app.message('whatismyuserid', async ({ context, say }) => {
  await say(context.userId!);
});

let setupAgent = () => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
  const CHECKLY_GITHUB_TOKEN = process.env.CHECKLY_GITHUB_TOKEN!;

  let openai = createOpenAI({ apiKey: OPENAI_API_KEY });
  let github = new GitHubAPI(CHECKLY_GITHUB_TOKEN);

  return new GithubAgent(openai('gpt-4o'), github);
}

const githubAgent = setupAgent();

app.event('app_mention', async ({ event, context }) => {
  console.log('app_mention event:', event);
  try {
    
    //needs reactions:write
    /*await app.client.reactions.add({
      token: context.botToken,
      name: 'wave',
      channel: event.channel,
      timestamp: event.ts,
    });*/
    // const initialResponse = await app.client.chat.postMessage({
    //   token: context.botToken,
    //   channel: event.channel,
    //   //<@${event.user}>
    //   text: `Hello ! Let me think..`,
    // });
    const updateUser = async (msg: string) => {
      app.client.chat.postMessage({
        token: context.botToken,
        channel: event.channel,
        //<@${event.user}>
        text: msg,
        thread_ts: event.ts,
      });
    };

    const sendReleaseSummary = async (blocks: any) => {
      app.client.chat.postMessage({
        token: context.botToken,
        channel: event.channel,
        //<@${event.user}>
        blocks,
      });
    };
  
    let summaries = await githubAgent.summarizeReleases(event.text, 'checkly');
    if (summaries.releases.length === 0) {
      await updateUser(`No releases found in repo ${summaries.repo} since ${summaries.since}`);
    }

    let releases = summaries.releases.sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime());
    let response = [releaseHeader].concat(releases.map(summary => {
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
    await sendReleaseSummary(response);
    //await agent.queryAgent(event.text, updateUser);
  } catch (error) {
    console.error('Error reacting to mention:', error);
  }
});

app.message(
  /^(see you later|im out|heading out|goodbye|have a good one|bye).*/,
  async ({ context, say }) => {
    const greetings = ['See you later', 'Have a great one', 'Ciao'];
    const choice = Math.floor(Math.random() * greetings.length);
    await say(`${greetings[choice]} <@${context.user}>`);
  },
);
