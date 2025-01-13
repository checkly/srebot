import { BaseAssistant } from "../ai/Assistant";
import { Tool } from "../ai/Tool";
import type { RunCreateParams } from "openai/resources/beta/threads";
import { SearchContextTool } from "./tools/SearchContextTool";
import { ChecklyTool } from "./tools/ChecklyTool";
import { GitHubTool } from "./tools/GitHubTool";
import { prisma } from "../prisma";
import { slackFormatInstructions } from "../slackbot/utils";
import {UserContextTool} from "./tools/UserContextTool";
import {ChecklyClient} from "../checkly/checklyclient";

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
2. Be concise but comprehensive in your explanations
3. Focus on providing actionable information that can help reduce MTTR
4. Load the check to see the script and understand the context and why the check is failing
5. The user is a experienced devops engineer. Don't overcomplicate it, focus on the context and provide actionable insights. They know what they are doing, don't worry about the details
6. Be proactive and helpful, don't wait for the user to ask for help
7. Make active use of the tools (multiple times if needed) to get a holistic view of the situation
8. Generate super short, concise and insightful messages. Users are experts, skip the fluff, no yapping.

INTERACTION CONTEXT:
Username: ${this.interactionContext["username"]}
Date: ${this.interactionContext["date"]}

OUTPUT FORMAT:
${slackFormatInstructions}

${alertSummary.length > 0 ? `Alert Summary:\n${alertSummary}` : ""}`;
	}

	protected async getTools(): Promise<Tool[]> {
		const userContext = await prisma.userContext.findFirst({
			where: {
				username: this.interactionContext.username,
			},
		})

		const checklyClient = new ChecklyClient({
			apiKey: userContext?.apiKey || '',
			accountId: userContext?.accountId, // defaults are defined in the client,
			checklyPrometheusKey: userContext?.checklyPrometheusKey || ''
		})

		if (!this.alertId) {
			return [new ChecklyTool(this, checklyClient), new GitHubTool(this), new UserContextTool(this)];
		}

		const searchContextTool = new SearchContextTool(this);
		await searchContextTool.init();
		return [searchContextTool, new ChecklyTool(this, checklyClient), new GitHubTool(this), new UserContextTool(this)];
	}
}
