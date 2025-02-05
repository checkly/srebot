import GitHubAPI from "../github/github";
import { AlertType, WebhookAlertDto } from "../checkly/alertDTO";
import { CheckContext, ContextKey } from "./ContextAggregator";
import {
  getLastCheckResult,
  mapCheckResultToContextValue,
} from "../checkly/utils";
import { prisma } from "../prisma";
import { generateObject } from "ai";
import { getOpenaiSDKClient } from "../ai/openai";
import { checkly } from "../checkly/client";
import { stringify } from "yaml";
import { z } from "zod";
import { Deployment, Release } from "@prisma/client";
import {
  generateFindRelevantDeploymentsPrompt,
  generateFindRelevantReleasesPrompt,
} from "../prompts/github";

const githubApi = new GitHubAPI(process.env.CHECKLY_GITHUB_TOKEN || "");

export const githubAggregator = {
  name: "GitHub",
  getRelevantReleases: async ({ fromDate, check, alertCheckResult, alert }) => {
    const releases = await prisma.release.findMany({
      where: {
        publishedAt: {
          gte: new Date(fromDate),
        },
      },
    });

    if (releases.length === 0) {
      return [];
    }

    const { object: relevantReleaseIds } = await generateObject({
      model: getOpenaiSDKClient()("gpt-4o"),
      prompt: generateFindRelevantReleasesPrompt(
        check,
        stringify(mapCheckResultToContextValue(alertCheckResult)),
        releases.map((r) => ({
          id: r.id,
          repo: r.repoUrl,
          release: r.name,
          summary: r.summary,
        })),
      ),
      schema: z.object({
        releaseIds: z
          .array(z.string())
          .describe(
            "The ids of the releases that are most relevant to the check failure.",
          ),
      }),
    });

    const relevantReleases = releases.filter((r) =>
      relevantReleaseIds.releaseIds.includes(r.id),
    );

    const makeRepoReleaseContext = (release: Release) =>
      ({
        key: ContextKey.GitHubReleaseSummary.replace(
          "$repo",
          `${release.org}/${release.repo}`,
        ),
        value: release,
        checkId: alert.CHECK_ID,
        source: "github",
      }) as CheckContext;

    return relevantReleases.map((release) => makeRepoReleaseContext(release));
  },
  getRelevantDeployments: async ({
    fromDate,
    check,
    alertCheckResult,
    alert,
  }) => {
    const deployments = await prisma.deployment.findMany({
      where: {
        createdAt: {
          gte: new Date(fromDate),
        },
      },
    });
    if (deployments.length === 0) {
      return [];
    }

    const { object: relevantReleaseIds } = await generateObject({
      model: getOpenaiSDKClient()("gpt-4o"),
      prompt: generateFindRelevantDeploymentsPrompt(
        check,
        stringify(mapCheckResultToContextValue(alertCheckResult)),
        deployments.map((deploy) => ({
          id: deploy.id,
          repo: deploy.repoUrl,
          createdAt: deploy.createdAt,
          summary: deploy.summary,
        })),
      ),
      schema: z.object({
        deploymentIds: z
          .array(z.string())
          .describe(
            "The ids of the releases that are most relevant to the check failure.",
          ),
      }),
    });

    const relevantReleases = deployments.filter((deployment) =>
      relevantReleaseIds.deploymentIds.includes(deployment.id),
    );

    const mapDeploymentToCheckContext = (deployment: Deployment) =>
      ({
        key: ContextKey.GitHubDeploymentSummary.replace(
          "$repo",
          `${deployment.org}/${deployment.repo}`,
        ),
        value: deployment,
        checkId: alert.CHECK_ID,
        source: "github",
      }) as CheckContext;

    return relevantReleases.map((deploy) =>
      mapDeploymentToCheckContext(deploy),
    );
  },
  fetchContext: async (alert: WebhookAlertDto): Promise<CheckContext[]> => {
    console.log("Aggregating GitHub Context...");
    try {
      await githubApi.checkRateLimit();

      // Identify the current state of the check
      // This may be both a failure or a recovery
      const hasCheckFailuresNow = alert.ALERT_TYPE !== AlertType.ALERT_RECOVERY;

      // For a recovery we need to find the last failure
      // For a failure we need to find the last success
      const hadCheckFailuresBeforeStateChange = !hasCheckFailuresNow;
      const lastCheckResultBeforeStateChange = await getLastCheckResult(
        alert.CHECK_ID,
        hadCheckFailuresBeforeStateChange,
      );

      const alertCheckResult = await checkly.getCheckResult(
        alert.CHECK_ID,
        alert.CHECK_RESULT_ID,
      );

      const check = await checkly.getCheck(alert.CHECK_ID);

      const [relevantReleases, relevantDeployments] = await Promise.all([
        githubAggregator.getRelevantReleases({
          fromDate: lastCheckResultBeforeStateChange?.startedAt,
          check,
          alertCheckResult: alertCheckResult,
          alert,
        }),
        githubAggregator.getRelevantDeployments({
          fromDate: lastCheckResultBeforeStateChange?.startedAt,
          check,
          alertCheckResult: alertCheckResult,
          alert,
        }),
      ]);

      return [...relevantReleases, ...relevantDeployments];
    } catch (error) {
      console.error("Error in GitHub aggregator:", error);
      return [];
    }
  },
};
