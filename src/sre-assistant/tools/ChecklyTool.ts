import { z } from "zod";
import { Tool, createToolParameters, createToolOutput } from "../../ai/Tool";
import { SreAssistant } from "../SreAssistant";
import { checkly } from "../../checkly/client";
import { stringify } from "yaml";
import {
	mapCheckResultToContextValue,
	mapCheckToContextValue,
} from "../../checkly/utils";
import { generateObject } from "ai";
import { getOpenaiSDKClient } from "../../ai/openai";

const parameters = createToolParameters(
	z.object({
		action: z
			.enum([
				"getCheck",
				"getCheckResult",
				"getAllFailingChecks",
				"searchCheck",
			])
			.describe("The action to perform on the Checkly API"),
		checkId: z
			.string()
			.describe(
				"The ID of the Check to get information about. Omit this field for the 'getChecksStatus' action."
			)
			.optional(),
		query: z
			.string()
			.describe(
				"A query to search for checks. Use this field only for the 'searchCheck' action."
			)
			.optional(),
	})
);

const outputSchema = createToolOutput(
	z.string().describe("The response from the Checkly API")
);

export class ChecklyTool extends Tool<
	typeof parameters,
	typeof outputSchema,
	SreAssistant
> {
	static parameters = parameters;
	static outputSchema = outputSchema;

	constructor(agent: SreAssistant) {
		super({
			name: "ChecklyAPI",
			description:
				"Interact with the Checkly API to retrieve relevant context about checks and check results.",
			parameters,
			agent,
		});
	}

	async execute(input: z.infer<typeof parameters>) {
		if (input.action === "getCheck") {
			const check = await checkly.getCheck(input.checkId!);
			return stringify({
				...mapCheckToContextValue(check),
				script: check.script,
			});
		} else if (input.action === "getCheckResult") {
			const results = await checkly
				.getCheckResults(input.checkId!, undefined, 1)
				.then((result) => {
					return result[0];
				});

			if (!results) {
				return "No results found";
			}

			return stringify(mapCheckResultToContextValue(results));
		} else if (input.action === "getAllFailingChecks") {
			const status = await checkly.getPrometheusCheckStatus();
			return stringify(status.failing);
		} else if (input.action === "searchCheck") {
			const checks = await checkly.getChecks();
			const search = await generateObject({
				model: getOpenaiSDKClient()("gpt-4o"),
				prompt: `You are the Checkly Check Search Engine. You are given a query and a list of checks. Return the most relevant check that relates to the query.

				Available checks: ${stringify(
					checks.map((c) => ({ ...mapCheckToContextValue(c) }))
				)}
				
				Search Query: ${input.query ?? ""}`,
				schema: z.object({
					checkName: z.string(),
					checkId: z.string(),
				}),
			});

			const relevantCheck = checks.find((c) => c.id === search.object.checkId);

			if (!relevantCheck) {
				return "No relevant check found";
			}

			return stringify({
				...mapCheckToContextValue(relevantCheck),
				script: relevantCheck.script,
			});
		}

		return "Invalid action";
	}
}
