import { BaseAssistant } from "../ai/Assistant";
import { Tool } from "../ai/Tool";
import type { RunCreateParams } from "openai/resources/beta/threads";
import { SearchContextTool } from "./tools/SearchContextTool";
import { GithubAgentInteractionTool } from "./tools/GithubAgentInteractionTool";
import { ChecklyTool } from "./tools/ChecklyTool";
import { prisma } from "../prisma";

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

Important reminders:
- Always prioritize accuracy and relevance in your insights and recommendations
- Be concise but comprehensive in your explanations
- If you're unsure about any aspect, clearly state your level of confidence
- Maintain a professional and calm tone throughout your responses
- Focus on providing actionable information that can help reduce MTTR
- Load the check to see the script and understand the context and why the check is failing

Interaction Context:
Username: ${this.interactionContext["Username"]}
Date: ${this.interactionContext["Date"]}

${alertSummary.length > 0 ? `Alert Summary:\n${alertSummary}` : ""}

Format your responses as slack mrkdwn messages and keep the answer concise and relevant.`;
	}

	protected async getTools(): Promise<Tool[]> {
		if (!this.alertId) {
			return [new ChecklyTool(this), new GithubAgentInteractionTool(this)];
		}

		const searchContextTool = new SearchContextTool(this);
		await searchContextTool.init();
		return [
			searchContextTool,
			new GithubAgentInteractionTool(this),
			new ChecklyTool(this),
		];
	}
}
