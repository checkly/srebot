import { SlackClient } from "./slack";

describe("Slack Web Api Tests", () => {
  let slack: SlackClient;

  beforeAll(() => {
    slack = new SlackClient(process.env.SLACK_AUTH_TOKEN || "");
  });

  it.skip("should summarize releases by prompt", async () => {
    const messages = (
      await slack.fetchHistoricalMessages("CUZ7V5YKZ", 1000)
    ).sort((a, b) => a.timestamp!.getTime() - b.timestamp!.getTime());
    console.log(JSON.stringify(messages, null, 2));

    const fs = require("fs");
    fs.writeFileSync("slack-messages.json", JSON.stringify(messages, null, 2));

    expect(messages).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toHaveProperty("plaintext");
    expect(messages[0]).toHaveProperty("username");
  });

  it("it should find the right displayname for a bot", async () => {
    console.log(await slack.fetchBotName("B03KU7YPASZ"));
  });

  it("it should find the right displayname for a user", async () => {
    console.log(await slack.fetchBotName("U026KTBH5K6"));
  });

  it("should check auth scopes", async () => {
    const scopes = await slack.getTokenScopes();
    expect(scopes).toEqual([
      "app_mentions:read",
      "channels:history",
      "channels:join",
      "chat:write",
      "chat:write.customize",
      "im:history",
      "im:write",
      "incoming-webhook",
      "commands",
    ]);
  });
});
