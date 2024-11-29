import crypto, { sign } from "crypto";
import express, { Request, Response, NextFunction } from "express";
import {
  ReleaseEvent,
  WebhookEvent,
  WebhookEventName,
} from "@octokit/webhooks-types";
import { App, LogLevel } from "@slack/bolt";
import { getOpenaiSDKClient } from "../ai/openai";
import GitHubAPI from "../github/github";
import { GithubAgent } from "../github/agent";
import { createReleaseBlock, releaseHeader } from "../github/slackBlock";
import moment from "moment";

const GH_WEBHOOK_SECRET = process.env.GH_WEBHOOK_SECRET || "your_secret";

export const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_AUTH_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel:
    process.env.NODE_ENV !== "production" ? LogLevel.DEBUG : LogLevel.INFO,
});

const CHECKLY_GITHUB_TOKEN = process.env.CHECKLY_GITHUB_TOKEN!;

const github = new GitHubAPI(CHECKLY_GITHUB_TOKEN);

let setupAgent = () => {
  let openai = getOpenaiSDKClient();

  return new GithubAgent(openai("gpt-4o"), github);
};

const githubAgent = setupAgent();

const router = express.Router();

function verifySignature(req: Request, res: Response, buf: Buffer) {
  const signature = req.headers["x-hub-signature-256"] as string;
  const hmac = crypto.createHmac("sha256", GH_WEBHOOK_SECRET);
  const digest = `sha256=${hmac.update(buf).digest("hex")}`;
  console.log("digest", digest, signature, signature === digest);
  
  return signature === digest;
}

router.get("/", (req: Request, res: Response) => {
	res.json({ message: "Hello from Github Webhook!" });
});


router.post(
  "/",
  async (req: Request, res: Response) => {
    if (!verifySignature(req, res, Buffer.from(JSON.stringify(req.body)))) {
      res.status(401).send("Signature verification failed");
      return;
    }

    const event = req.headers["x-github-event"] as WebhookEventName;
    const payload = req.body as WebhookEvent;

    switch (event) {
      case "ping":
        console.log("Ping event received");
        res.status(200).send("Webhook received");
        break;
      case "release":
        let releaseEvent = payload as ReleaseEvent;
        if (releaseEvent.action !== "published") {
          res.status(200).send("Webhook received");
          return;
        }

        console.log(
          "Release event received:",
          releaseEvent.repository.owner.login
        );

        const previousRelease = await github.getPreviousReleaseTag(
          releaseEvent.repository.owner.login,
          releaseEvent.repository.name,
          releaseEvent.release.tag_name
        );

        const release = await githubAgent.summarizeRelease(
          releaseEvent.repository.owner.login,
          releaseEvent.repository.name,
          releaseEvent.release.tag_name,
          previousRelease
        );
        const date = moment(releaseEvent.release.published_at).fromNow();
        const authors = release.diff.commits
          .map((c) => c.author)
          .filter((author) => author !== null)
          .map((author) => author.login);
        let releaseBlocks = createReleaseBlock({
          release: releaseEvent.release.name,
          releaseUrl: releaseEvent.release.html_url,
          diffUrl: release.diff.html_url,
          date,
          repo: releaseEvent.repository.name,
          repoUrl: releaseEvent.repository.html_url,
          authors,
          summary: release.summary,
        }).blocks;

        await app.client.chat.postMessage({
          channel: process.env.SLACK_RELEASE_CHANNEL_ID as string,
          metadata: {
            event_type: "release-summary",
            event_payload: {},
          },
          blocks: releaseBlocks,
        });

        res.status(200).send("Webhook received");
        break;
      default:
        console.log("Unhandled event received:", event);
        res.status(404).send("Webhook received");
    }
  }
);

export default router;
