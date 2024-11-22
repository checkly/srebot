import {
	Message,
	Run,
	RunSubmitToolOutputsParams,
} from "openai/resources/beta/threads";
import { getOpenaiClient } from "./openai";
import { stringify } from "yaml";

const openai = getOpenaiClient();

export const requiresToolAction = (run: Run): boolean => {
	return (
		run?.status === "requires_action" &&
		run.required_action?.type === "submit_tool_outputs"
	);
};

export const isThreadLockError = (error: any): boolean => {
	return (error.message as string).includes("Can't add messages to thread_");
};

export const cancelRun = async (threadId: string): Promise<void> => {
	const run = await openai.beta.threads.runs
		.list(threadId, { limit: 1, order: "desc" })
		.then((response) => response.data[0]);

	if (run) {
		await openai.beta.threads.runs.cancel(threadId, run.id);
	}
};

export const formatToolOutput = (
	toolCallId: string,
	output: unknown
): RunSubmitToolOutputsParams.ToolOutput => {
	return {
		output: JSON.stringify(output),
		tool_call_id: toolCallId,
	};
};

export const handleToolError = (
	toolCallId: string,
	error: Error
): RunSubmitToolOutputsParams.ToolOutput => {
	return {
		output: stringify({ error: error.message ?? "Unknown error" }),
		tool_call_id: toolCallId,
	};
};

export const getRunMessages = async (
	threadId: string,
	runId: string
): Promise<Message[]> => {
	const messages = await openai.beta.threads.messages.list(threadId, {
		run_id: runId,
	});
	return messages.data;
};
