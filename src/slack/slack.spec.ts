import { SlackClient } from "./slack";

describe("Slack Web Api Tests", () => {
  let slack: SlackClient;

  beforeAll(() => {
    slack = new SlackClient(process.env.SLACK_AUTH_TOKEN || "");
  });

  it.skip("should summarize releases by prompt", async () => {
    const messages = await slack.fetchHistoricalMessages("CUZ7V5YKZ");
    console.log(JSON.stringify(messages, null, 2));

    expect(messages).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toHaveProperty("plaintext");
    expect(messages[0]).toHaveProperty("username");
  });
});
