import { BaseAssistant } from "../ai/Assistant";
import { Tool } from "../ai/Tool";
import type { RunCreateParams } from "openai/resources/beta/threads";
import { SearchContextTool } from "./tools/SearchContextTool";
import { ChecklyTool } from "./tools/ChecklyTool";
import { GitHubTool } from "./tools/GitHubTool";
import { prisma } from "../prisma";
import { KnowledgeTool } from "./tools/KnowledgeTool";
import { TimeframeTranslationTool } from "./tools/TimeframeTranslationTool";
import { generateSREAssistantPrompt } from "src/prompts/sre-assistant";

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
    config?: Partial<RunCreateParams>,
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

    return generateSREAssistantPrompt(
      this.interactionContext["username"],
      this.interactionContext["date"],
      alertSummary,
    );
  }

  protected async getTools(): Promise<Tool[]> {
    if (!this.alertId) {
      return [
        new ChecklyTool(this),
        new GitHubTool(this),
        new KnowledgeTool(this),
        new TimeframeTranslationTool(this),
      ];
    }

    const searchContextTool = new SearchContextTool(this);
    await searchContextTool.init();
    return [
      searchContextTool,
      new ChecklyTool(this),
      new GitHubTool(this),
      new KnowledgeTool(this),
    ];
  }
}
