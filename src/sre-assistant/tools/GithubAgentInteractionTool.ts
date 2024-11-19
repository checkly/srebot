import { z } from "zod";
import { Tool, createToolParameters, createToolOutput } from "../../ai/Tool";
import { SreAssistant } from "../SreAssistant";
import { getOpenaiSDKClient } from "../../ai/openai";
import GitHubAPI from "../../github/github";
import dotenv from "dotenv";
import { GithubAgent } from "../../github/agent";
import { stringify } from "yaml";

dotenv.config();

const CHECKLY_GITHUB_TOKEN = process.env.CHECKLY_GITHUB_TOKEN!;

const parameters = createToolParameters(
	z.object({
		request: z
			.string()
			.describe(
				"A request for the GitHub NLP agent. For example: what changed in the ui since yesterday"
			),
	})
);

const outputSchema = createToolOutput(z.string());

export class GithubAgentInteractionTool extends Tool<
	typeof parameters,
	typeof outputSchema,
	SreAssistant
> {
	static parameters = parameters;
	static outputSchema = outputSchema;

	constructor(agent: SreAssistant) {
		super({
			name: "GithubAgentInteraction",
			description:
				"Interact with the GitHub NLP agent to retrieve relevant context for a given request. You can use this tool gather information from the context of a GitHub repository.",
			parameters,
			agent,
		});
	}

	async execute(input: z.infer<typeof parameters>) {
		const github = new GitHubAPI(CHECKLY_GITHUB_TOKEN);
		let agent = new GithubAgent(getOpenaiSDKClient()("gpt-4o"), github);
		let response = await agent.summarizeReleases(input.request, "checkly");

		return stringify(response);
	}
}
