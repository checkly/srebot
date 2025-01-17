import { BaseAssistant } from "../ai/Assistant";
import { Tool } from "../ai/Tool";
import type { RunCreateParams } from "openai/resources/beta/threads";
import { SearchContextTool } from "./tools/SearchContextTool";
import { ChecklyTool } from "./tools/ChecklyTool";
import { GitHubTool } from "./tools/GitHubTool";
import { prisma } from "../prisma";
import { slackFormatInstructions } from "../slackbot/utils";

export class SreAssistant extends BaseAssistant {
  alertId: string | undefined;
  interactionContext: {
    username: string;
    date: string;
  };

  constructor(
    threadId: string,
    alertId: string | undefined = undefined,
    interactionContext: {
      username: string;
      date: string;
    },
    config?: Partial<RunCreateParams>
  ) {
    super(threadId, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID as string,
      temperature: 1,
      parallel_tool_calls: true,
      max_completion_tokens: 800,
      ...config,
    });

    this.interactionContext = interactionContext;
    this.alertId = alertId;
  }

  protected async getInstructions(): Promise<string> {
    let alertSummary = "";
    if (this.alertId) {
      const alert = await prisma.alert.findUniqueOrThrow({
        where: {
          id: this.alertId,
        },
        select: {
          summary: true,
        },
      });

      alertSummary = alert.summary;
    }

    return `You are an AI-powered SRE Bot designed to assist in real-time incident management. Your primary goal is to reduce Mean Time To Resolution (MTTR) by automatically aggregating and analyzing contextual data, providing actionable insights, and guiding first responders effectively.

CONSTITUTION:
1. Always prioritize accuracy and relevance in your insights and recommendations
2. Be concise but comprehensive in your explanations. Skip unnecessary details; deliver actionable insights suitable for experienced DevOps engineers.
3. Focus on providing actionable information that can help reduce MTTR
4. Load the check to see the script and understand the context and why the check is failing
5. The user is a experienced devops engineer. Don't overcomplicate it, focus on the context and provide actionable insights. They know what they are doing, don't worry about the details
6. Proactive Investigations: Automatically gather contextual data about the alert, such as related checks, logs, metrics, and recent system changes (e.g., releases, deployments, or config updates). Look for recent releases or changes within a relevant time window that could explain the failure.
7. Make active use of the tools (multiple times if needed) to get a holistic view of the situation
8. Generate super short, concise and insightful messages. Users are experts, skip the fluff, no yapping.
9. Context-Driven Analysis: Load the check to understand the failure context and its potential root cause. Cross-reference the alert with logs, metrics, and change histories to identify anomalies or patterns. Please remember that releases (changes) are the most common reason for alerting events, focus on analysing recent changes.

INTERACTION CONTEXT:
Username: ${this.interactionContext["username"]}
Date: ${this.interactionContext["date"]}

OUTPUT FORMAT:
${slackFormatInstructions}

${alertSummary.length > 0 ? `Alert Summary:\n${alertSummary}` : ""}`;
  }

  protected async getTools(): Promise<Tool[]> {
    if (!this.alertId) {
      return [new ChecklyTool(this), new GitHubTool(this)];
    }

    const searchContextTool = new SearchContextTool(this);
    await searchContextTool.init();
    return [searchContextTool, new ChecklyTool(this), new GitHubTool(this)];
  }
}
