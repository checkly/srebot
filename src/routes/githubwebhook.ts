import { Prisma } from "@prisma/client";

import crypto from "crypto";
import timers from "node:timers/promises";
import express, { Request, Response } from "express";
import {
  DeploymentStatusEvent,
  ReleaseEvent,
  WebhookEvent,
  WebhookEventName,
} from "@octokit/webhooks-types";
import { App, LogLevel } from "@slack/bolt";
import { getOpenaiSDKClient } from "../ai/openai";
import GitHubAPI, { CompareCommitsResponse } from "../github/github";
import { GithubAgent } from "../github/agent";
import {
  createDeploymentBlock,
  createReleaseBlock,
} from "../github/slackBlock";
import moment from "moment";
import { prisma } from "../prisma";
import { saveResponseAndAskForFeedback } from "../slackbot/feedback";

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

// Repositories to ignore (passed as a comma-separated list, for example "repo1,repo2")
// We can use this to narrow down the repositories we want to monitor
const ignoredRepos = new Set(process.env.IGNORED_REPOS?.split(",") || []);

// Environments to ignore (passed as a comma-separated list, for example "staging,Preview")
const ignoredEnvironments = new Set(
  process.env.IGNORED_ENVIRONMENTS?.split(",") || [],
);

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

const withRetry = async <T>(fn: () => Promise<T>, attempts = 2): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (attempts <= 0) {
      throw err;
    }
    await timers.setTimeout(1000);
    return await withRetry(fn, attempts - 1);
  }
};

const pullAuthors = (diff: CompareCommitsResponse): string[] => {
  return [
    ...new Set(
      diff.commits
        .map((c) => c.author)
        .filter((author) => author !== null)
        .map((author) => author.login),
    ),
  ];
};

router.post("/", async (req: Request, res: Response) => {
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
    case "deployment_status":
      console.log("Deployment event received");
      const deploymentEvent = payload as DeploymentStatusEvent;

      if (deploymentEvent.deployment_status.state !== "success") {
        res.status(200).send("Webhook received");
        return;
      }

      try {
        // Extract deployment details
        const { repository, deployment } = deploymentEvent;
        const repositoryName = repository.name;
        if (ignoredRepos.has(repositoryName)) {
          console.log(
            `Ignoring deployment event for repository ${repositoryName}`,
          );
          res.status(200).send("Ignoring deployment event");
          return;
        }

        const environment = deployment.environment || "unknown";
        if (ignoredEnvironments.has(environment)) {
          console.log(
            `Ignoring deployment event for environment ${environment}`,
          );
          res.status(200).send("Ignoring deployment event");
          return;
        }

        const organizationName =
          deploymentEvent.organization?.login || repository.owner.login;

        // Check if a deployment with the same sha, repo, org, and environment already exists
        const existingDeployment = await prisma.deployment.findFirst({
          where: {
            sha: deployment.sha,
            repo: repositoryName,
            org: repository.owner.login,
            environment: environment,
          },
        });

        if (existingDeployment) {
          console.log(
            `Deployment with sha ${deployment.sha} already exists for ${repositoryName} in ${deployment.environment}. Skipping.`,
          );
          res.status(200).send("Duplicate deployment event, skipping.");
          return;
        }

        const previousDeployment = await withRetry(() =>
          github.getPreviousDeployment(
            organizationName,
            repositoryName,
            deployment.environment,
            deployment.id,
            deployment.sha,
          ),
        );
        if (previousDeployment === null) {
          console.log(
            `No previous deployment found for ${repositoryName} in ${deployment.environment}.`,
          );
          return;
        }

        const diffUrl = `https://github.com/${repository.owner.login}/${repositoryName}/compare/${previousDeployment.sha || ""}...${deployment.sha}`;
        const deploymentData = {
          org: repository.owner.login,
          repo: repositoryName,
          repoUrl: repository.html_url,
          environment: environment,
          sha: deployment.sha,
          deploymentUrl: deploymentEvent.deployment.url,
          diffUrl,
        };
        console.log("Saving deployment to the database:", deploymentData);

        const diffSummary = await githubAgent.summarizeDeployment(
          organizationName,
          repositoryName,
          deployment.sha,
          previousDeployment.sha,
        );

        // Save deployment to the database
        const deploymentRecord = await prisma.deployment.create({
          data: {
            ...deploymentData,
            rawEvent: deploymentEvent as unknown as Prisma.InputJsonValue,
            summary: diffSummary.summary,
            createdAt: new Date(deployment.created_at),
          },
        });

        console.log("Deployment saved successfully.");

        const date = moment(deployment.created_at).fromNow();
        const authors = pullAuthors(diffSummary.diff);

        const deploymentBlocks = createDeploymentBlock({
          diffUrl,
          authors,
          date,
          environment,
          repo: repositoryName,
          repoUrl: deploymentData.repoUrl,
          deploymentUrl: deployment.url,
          summary: diffSummary.summary,
        }).blocks;
        console.log("Posting a message to Slack");
        const postMessageResponse = await app.client.chat.postMessage({
          channel: process.env.SLACK_RELEASE_CHANNEL_ID as string,
          text: `New Deployment in ${deployment.environment} Environment: in ${organizationName}/${repositoryName}`,
          metadata: {
            event_type: "deployment",
            event_payload: {
              deploymentId: deploymentRecord.id,
            },
          },
          blocks: deploymentBlocks,
        });
        await saveResponseAndAskForFeedback(postMessageResponse);

        res.status(200).send("Deployment event processed successfully");
      } catch (error) {
        console.error("Error processing deployment event:", error);
        res.status(500).send("Error processing deployment event");
      }
      break;
    case "release":
      let releaseEvent = payload as ReleaseEvent;
      if (releaseEvent.action !== "published") {
        res.status(200).send("Webhook received");
        return;
      }
      const repoName = releaseEvent.repository.name;
      if (ignoredRepos.has(repoName)) {
        console.log(`Ignoring release event for repository ${repoName}`);
        res.status(200).send("Ignoring release event");
        return;
      }

      console.log(
        "Release event received:",
        releaseEvent.repository.owner.login,
      );

      const previousRelease = await withRetry(() =>
        github.getPreviousReleaseTag(
          releaseEvent.repository.owner.login,
          releaseEvent.repository.name,
          releaseEvent.release.tag_name,
        ),
      );

      const release = await githubAgent.summarizeRelease({
        org: releaseEvent.repository.owner.login,
        repo: repoName,
        previousRelease,
        release: releaseEvent.release.tag_name,
      });
      const date = moment(releaseEvent.release.published_at).fromNow();
      const authors = pullAuthors(release.diff);
      let releaseName =
        releaseEvent.release.name || releaseEvent.release.tag_name;
      let releaseBlocks = createReleaseBlock({
        release: releaseName,
        releaseUrl: releaseEvent.release.html_url,
        diffUrl: release.diff.html_url,
        date,
        repo: repoName,
        repoUrl: releaseEvent.repository.html_url,
        authors,
        summary: release.summary,
      }).blocks;

      console.log("Creating a new release in the database");
      const createdRelease = await prisma.release.create({
        data: {
          name: releaseName,
          releaseUrl: releaseEvent.release.html_url,
          publishedAt: releaseEvent.release.published_at,
          org: releaseEvent.repository.owner.login,
          repo: repoName,
          repoUrl: releaseEvent.repository.html_url,
          tag: releaseEvent.release.tag_name,
          diffUrl: release.diff.html_url,
          authors,
          summary: release.summary,
        },
      });
      await prisma.rawRelease.create({
        data: {
          body: releaseEvent as unknown as Prisma.InputJsonValue,
          releaseId: createdRelease.id,
        },
      });

      console.log("Posting a message to Slack");
      const postMessageResponse = await app.client.chat.postMessage({
        channel: process.env.SLACK_RELEASE_CHANNEL_ID as string,
        text: `New release: ${releaseEvent.release.name} in ${releaseEvent.repository.owner.login}/${repoName}`,
        metadata: {
          event_type: "release",
          event_payload: {
            releaseId: createdRelease.id,
          },
        },
        blocks: releaseBlocks,
      });
      await saveResponseAndAskForFeedback(postMessageResponse);

      res.status(200).send("Webhook received");
      break;
    default:
      console.log("Unhandled event received:", event);
      res.status(200).send("Webhook received");
  }
});

export default router;
