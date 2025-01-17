import { checklyAggregator } from "./checkly-aggregator";
import { WebhookAlertDto } from "../checkly/alertDTO";
import { githubAggregator } from "./github-aggregator";
import type { $Enums } from "@prisma/client";
import { slackChannelAggregator } from "./slack-channel-aggregator";
import {knowledgeAggregator} from "./knowledge-aggregator";

export enum ContextKey {
	ChecklyScript = "checkly.script",
	ChecklyAlert = "checkly.alert",
	ChecklyCheck = "checkly.check",
	ChecklyResults = "checkly.results",
	ChecklyPrometheusStatus = "checkly.prometheusStatus",
	ChecklyLogs = "checkly.logs",
	GitHubRepoChanges = "github.repoChanges.$repo",
	GitHubReleaseSummary = "github.releaseSummary.$repo",
	Knowledge = "knowledge.$documentSlug",
  SlackChannelSummary = "slack.channelSummary.$channel",
}

export interface CheckContext {
  checkId: string;
  source: $Enums.Source;
  key: ContextKey;
  value: unknown;
  analysis: string;
}

export class CheckContextAggregator {
  alert: WebhookAlertDto;
  plugins = [checklyAggregator, githubAggregator, slackChannelAggregator, knowledgeAggregator];

  constructor(alert: WebhookAlertDto) {
    this.alert = alert;
  }

  aggregate() {
    return Promise.all(
      this.plugins.map(async (plugin) => {
        return plugin.fetchContext(this.alert).catch((error) => {
          console.error(
            `Error fetching context from ${plugin.name ?? "unknown plugin"}:`,
            error
          );
          return [];
        });
      })
    ).then((results) => results.flat());
  }
}
