import { BaseAssistant } from "../ai/Assistant";
import { Tool } from "../ai/Tool";
import type { RunCreateParams } from "openai/resources/beta/threads";
import { SearchContextTool } from "./tools/SearchContextTool";
import { ChecklyTool } from "./tools/ChecklyTool";
import { GitHubTool } from "./tools/GitHubTool";
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
			temperature: 1,
			parallel_tool_calls: true,
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

*CONSTITUTION:*
1. Always prioritize accuracy and relevance in your insights and recommendations
2. Be concise but comprehensive in your explanations
3. Focus on providing actionable information that can help reduce MTTR
4. Load the check to see the script and understand the context and why the check is failing
5. The user is a experienced devops engineer. Don't overcomplicate it, focus on the context and provide actionable insights. They know what they are doing, don't worry about the details.
6. Be proactive and helpful, don't wait for the user to ask for help.
7. Make active use of the tools (multiple times if needed) to get a holistic view of the situation.

*INTERACTION CONTEXT:*
* Username: ${this.interactionContext["username"]}
* Date: ${this.interactionContext["date"]}

${alertSummary.length > 0 ? `*Alert Summary:*\n${alertSummary}` : ""}

*Important:* Format your responses as a slack message (ALWAYS apply the the following format to all outputs: *bold*, _italic_, ~strikethrough~, * list-item, <http://www.example.com|This *is* a link>) and keep the answer concise and relevant. Include links (slack format e.g. <https://example.com|Example>) to the relevant context in your response if applicable.`;
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
