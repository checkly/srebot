import crypto from "crypto";
import express, { Request, Response, NextFunction } from "express";
import {
  ReleaseEvent,
  WebhookEvent,
  WebhookEventName,
} from "@octokit/webhooks-types";
import { App, LogLevel } from "@slack/bolt";
import { getOpenaiSDKClient } from "src/ai/openai";
import GitHubAPI from "src/github/github";
import { GithubAgent } from "src/github/agent";
import { createReleaseBlock, releaseHeader } from "../github/slackBlock";
import moment from "moment";

const GITHUB_SECRET = process.env.GITHUB_SECRET || "your_secret";

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

async function verifySignature(req: Request, res: Response, buf: Buffer) {
  const signature = req.headers["x-hub-signature-256"] as string;
  const hmac = crypto.createHmac("sha256", GITHUB_SECRET);
  const digest = `sha256=${hmac.update(buf).digest("hex")}`;

  if (signature !== digest) {
    throw new Error("Invalid signature");
  }
}

router.post(
  "/webhook",
  express.json({ verify: verifySignature }),
  async (req: Request, res: Response) => {
    const event = req.headers["x-github-event"] as WebhookEventName;
    const body = req.body as WebhookEvent;

    switch (event) {
      case "release":
        let releaseEvent = body as ReleaseEvent;
        if (releaseEvent.action !== "published") {
          res.status(200).send("Webhook received");
          return;
        }

        const previousRelease = await github.getPreviousReleaseTag('checkly', releaseEvent.repository.name, releaseEvent.release.tag_name);

        const release = await githubAgent.summarizeRelease(
          releaseEvent.repository.organization!,
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
          channel: "C07V9GNU9L6",
          metadata: {
            event_type: "release-summary",
            event_payload: {
              
            },
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
