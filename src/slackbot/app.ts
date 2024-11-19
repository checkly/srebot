import { createOpenAI } from '@ai-sdk/openai';
import { App, LogLevel } from '@slack/bolt';
import { GithubAgent } from '../github/agent';
import GitHubAPI from '../github/github';
import moment from 'moment';

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

    await updateUser(`I am thinking...`);

    let summaries = await githubAgent.summarizeReleases(event.text, 'checkly');
    if (summaries.releases.length === 0) {
      await updateUser(`No releases found in repo ${summaries.repo} since ${summaries.since}`);
    }

    let releases = summaries.releases.sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime());
    let response = releases.map(summary => {
      const formattedDate = moment(summary.release_date).fromNow();
      return `<${summary.link}|*${summary.id}*>\n:date: ${formattedDate}\n:package: <${summaries.repo.link}|${summaries.repo.name}>\n\`\`\`${summary.summary}\`\`\`\n Authors: ${summary.authors.map(author => author?.name).join(', ')}`;
    }).reduce((prev, curr) => {
      return prev + '\n' + curr;
    });
    await updateUser(response);
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
