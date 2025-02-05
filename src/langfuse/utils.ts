import { LangfuseTraceClient } from "langfuse";
import { Run } from "openai/resources/beta/threads";
import { Message } from "openai/resources/beta/threads/messages";
import { RunStep } from "openai/resources/beta/threads/runs";
import { getMessageHistory, getRunMessages, getRunSteps } from "../ai/utils";

interface MessageContent {
  role: string;
  content: string;
}

/**
 * Formats message content into a standardized string
 */
export function formatMessageContent(message: Message): MessageContent {
  return {
    role: message.role,
    content: message.content
      .map((c) => (c.type === "text" ? c.text.value : c.type))
      .join(" "),
  };
}

/**
 * Creates base input array from run instructions and message history
 */
export function createBaseInput(
  run: Run,
  history: Message[]
): MessageContent[] {
  return [
    { role: "system", content: run.instructions },
    ...history.map(formatMessageContent),
  ];
}

/**
 * Process step details and return formatted output
 */
export function processStepOutput(
  step: RunStep,
  messages: Message[]
): MessageContent[] {
  const output: MessageContent[] = [];

  if (step.step_details.type === "message_creation") {
    const msgId = step.step_details.message_creation.message_id;
    const msg = messages.find((m) => m.id === msgId);
    if (msg) {
      output.push(formatMessageContent(msg));
    }
  } else if (step.type === "tool_calls") {
    step.step_details.tool_calls
      .filter((call) => call.type === "function")
      .forEach((call) => {
        output.push({
          role: "tool: " + call.function.name,
          content: JSON.stringify({
            args: call.function.arguments,
            output: call.function.output,
          }),
        });
      });
  }

  return output;
}

/**
 * Traces run steps and updates the Langfuse trace
 */
export async function traceRunSteps(
  runTrace: LangfuseTraceClient,
  run: Run
): Promise<void> {
  const messages = await getRunMessages(run.thread_id, run.id);
  const historyCall = getMessageHistory(run.thread_id, messages[0].id);
  const runStepsCall = getRunSteps(run.thread_id, run.id);
  const [history, runSteps] = await Promise.all([historyCall, runStepsCall]);

  const baseInput = createBaseInput(run, history);
  let cumulativeOutput: MessageContent[] = [];

  for (const [index, step] of runSteps.entries()) {
    const stepOutput = processStepOutput(step, messages);
    const currentInput = [...baseInput, ...cumulativeOutput];
    cumulativeOutput = [...cumulativeOutput, ...stepOutput];

    console.log("step", index);

    if (index === runSteps.length - 1) {
      console.log("last step");
      runTrace
        .generation({
          modelParameters: {
            temperature: run.temperature,
            top_p: run.top_p,
            max_prompt_tokens: run.max_prompt_tokens,
            max_completion_tokens: run.max_completion_tokens,
          },
          startTime: new Date(step.created_at * 1000),
          model: run.model,
          input: currentInput,
        })
        .end({
          output: stepOutput,
          usage: {
            promptTokens: run.usage?.prompt_tokens,
            completionTokens: run.usage?.completion_tokens,
            totalTokens: run.usage?.total_tokens,
          },
          usageDetails: {
            ...(run.usage?.prompt_tokens && {
              promptTokens: run.usage.prompt_tokens,
            }),
            ...(run.usage?.completion_tokens && {
              completionTokens: run.usage.completion_tokens,
            }),
            ...(run.usage?.total_tokens && {
              totalTokens: run.usage.total_tokens,
            }),
          },
        });
      runTrace.update({
        input: baseInput,
        output: cumulativeOutput,
      });
    }
  }
}
