import { AssistantMessage, DataMessage } from "ai";
import { LangfuseTraceClient } from "langfuse";
import { toFile } from "openai";
import type { AssistantStream } from "openai/lib/AssistantStream.js";
import { FileObject } from "openai/resources";
import type {
  Message,
  MessageCreateParams,
  RequiredActionFunctionToolCall,
  Run,
  RunCreateParams,
  RunCreateParamsNonStreaming,
  RunSubmitToolOutputsParams,
} from "openai/resources/beta/threads";
import { langfuse } from "../langfuse";
import { traceRunSteps } from "../langfuse/utils";
import { getOpenaiClient } from "./openai";
import type { Tool } from "./Tool";
import {
  cancelRun,
  formatToolOutput,
  handleToolError,
  isThreadLockError,
  requiresToolAction,
} from "./utils";

const openai = getOpenaiClient();

// Enhanced types for better type safety
export interface RunContext {
  forwardStream?: (runStream: AssistantStream) => Promise<Run | undefined>;
  sendDataMessage?: (message: DataMessage) => void;
  sendMessage?: (message: AssistantMessage) => void;
  threadId: string;
  messageId?: string;
  config?: Partial<RunCreateParams>;
  toolCallStack: ToolCallWithOutput[];
  runTrace?: LangfuseTraceClient;
}

interface ToolCallWithOutput extends RequiredActionFunctionToolCall {
  output: string;
}

interface RunOptions {
  stream?: boolean;
}

/**
 * AssistantAgent class for managing OpenAI assistant interactions
 */
export class BaseAssistant {
  private readonly config: RunCreateParams;
  private readonly threadId: string;
  private runContext: RunContext | null = null;
  private readonly metadata: Record<string, unknown> = {};

  constructor(threadId: string, config: RunCreateParams) {
    this.config = config;
    this.threadId = threadId;
  }

  /**
   * Get agent metadata
   */
  public getMetadata(): Record<string, unknown> {
    return { ...this.metadata };
  }

  /**
   * Get current run context
   */
  public getRunContext(): RunContext | null {
    return this.runContext;
  }

  /**
   * Start a streaming run
   */
  public async runStream(
    runContext?: RunContext | null,
    runConfig?: Partial<RunCreateParams>,
  ): Promise<AssistantStream> {
    this.runContext = runContext ??
      this.runContext ?? {
        threadId: this.threadId,
        toolCallStack: [],
      };
    await this.onBeforeRun();
    const config = await this.prepareRunConfig();
    this.traceRun(config);
    return openai.beta.threads.runs.stream(this.threadId, {
      ...config,
      ...runConfig,
      stream: true,
    });
  }

  private traceRun(config: RunCreateParams) {}

  /**
   * Execute a synchronous run
   */
  public async runSync(
    runContext?: RunContext | null,
    runConfig?: Partial<RunCreateParams>,
  ): Promise<Run> {
    this.runContext = runContext ??
      this.runContext ?? {
        threadId: this.threadId,
        toolCallStack: [],
      };
    await this.onBeforeRun();
    const config = await this.prepareRunConfig();

    this.traceRun(config);
    const run = await openai.beta.threads.runs.createAndPoll(this.threadId, {
      ...(config as RunCreateParamsNonStreaming),
      ...runConfig,
      stream: false,
    });

    return this.handleRunResult(run, { stream: false });
  }

  /**
   * Handle run results and tool outputs
   */
  public async handleRunResult(
    runResult: Run,
    options: RunOptions = { stream: true },
  ): Promise<Run> {
    if (!requiresToolAction(runResult)) {
      await this._onAfterRun(runResult);
      return runResult;
    }

    const toolOutputs = await this.processToolCalls(runResult);
    return this.submitToolOutputsAndContinue(runResult, toolOutputs, options);
  }

  /**
   * Add a message to the thread
   */
  public async addMessage(
    message: string,
    options?: Partial<MessageCreateParams>,
  ): Promise<Message> {
    try {
      return await openai.beta.threads.messages.create(this.threadId, {
        role: "user",
        content: message,
        ...options,
      });
    } catch (error) {
      if (isThreadLockError(error)) {
        await cancelRun(this.threadId);
        return this.addMessage(message, options);
      }
      throw error;
    }
  }

  /**
   * Add a file to the thread
   */
  public async addFile(
    file: Buffer,
    purpose: "vision" | "assistants",
  ): Promise<FileObject> {
    return await openai.files.create({
      file: await toFile(file, "screenshot.png", {
        type: "image/png",
      }),
      purpose,
    });
  }

  /**
   * Get available tools - override in subclass
   */
  protected async getTools(): Promise<Tool[]> {
    return [];
  }

  /**
   * Get a specific tool by name
   */
  protected async getTool(name: string): Promise<Tool> {
    const tools = await this.getTools();
    const tool = tools.find((t) => t.getMetadata().name === name);

    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    return tool;
  }

  /**
   * Get agent instructions - override in subclass
   */
  protected async getInstructions(): Promise<string> {
    return this.config.instructions ?? "You are a helpful assistant.";
  }

  /**
   * Hook called after run completion - override in subclass
   */
  async onAfterRun(run: Run): Promise<void> {}

  /**
   * Hook called after run completion
   */
  protected async _onAfterRun(run: Run): Promise<void> {
    if (this.runContext?.runTrace) {
      await traceRunSteps(this.runContext.runTrace, run);
    }

    await this.onAfterRun(run);
  }

  /**
   * Hook called before run execution - override in subclass
   */
  protected async onBeforeRun(): Promise<void> {
    const runTrace = langfuse.trace({
      name: "assistant",
      timestamp: new Date(),
      sessionId: this.threadId,
      tags: ["assistant"],
    });

    if (this.runContext) {
      this.runContext = {
        ...this.runContext,
        runTrace,
      };
    }
  }

  /**
   * Submit tool outputs in streaming mode
   */
  private async submitToolOutputsStream(
    runId: string,
    toolOutputs: RunSubmitToolOutputsParams.ToolOutput[],
  ): Promise<AssistantStream> {
    return openai.beta.threads.runs.submitToolOutputsStream(
      this.threadId,
      runId,
      {
        tool_outputs: toolOutputs,
        stream: true,
      },
    );
  }

  /**
   * Execute a tool call
   */
  private async runTool(
    toolCall: RequiredActionFunctionToolCall,
  ): Promise<unknown> {
    try {
      const parameters = JSON.parse(toolCall.function.arguments);
      const tool = await this.getTool(toolCall.function.name);
      const output = await tool.run(parameters);

      this.runContext?.toolCallStack.push({ ...toolCall, output });
      return output;
    } catch (error) {
      console.error(`Tool execution failed: ${toolCall.function.name}`, error);
      return {
        error: error.message ?? JSON.stringify(error),
      };
    }
  }

  /**
   * Prepare run configuration
   */
  private async prepareRunConfig() {
    const tools = await this.getTools();
    const instructions = await this.getInstructions();

    return {
      ...this.config,
      assistant_id: this.config.assistant_id,
      tools: tools.map((tool) => tool.toAssistantTool()),
      instructions,
      model: this.config.model,
    };
  }

  /**
   * Process tool calls and generate outputs
   */
  private async processToolCalls(
    run: Run,
  ): Promise<RunSubmitToolOutputsParams.ToolOutput[]> {
    if (!run.required_action?.submit_tool_outputs.tool_calls) {
      return [];
    }

    return Promise.all(
      run.required_action.submit_tool_outputs.tool_calls.map(
        async (toolCall) => {
          const output = await this.runTool(toolCall).catch((error) => {
            return handleToolError(toolCall.id, error);
          });

          const toolOutput = formatToolOutput(toolCall.id, output);
          this.sendToolDataMessage(toolCall, toolOutput);
          return toolOutput;
        },
      ),
    );
  }

  /**
   * Submit tool outputs and continue processing
   */
  private async submitToolOutputsAndContinue(
    run: Run,
    toolOutputs: RunSubmitToolOutputsParams.ToolOutput[],
    options: RunOptions,
  ): Promise<Run> {
    if (options.stream) {
      const runStream = await this.submitToolOutputsStream(run.id, toolOutputs);
      const nextRun = await this.runContext?.forwardStream?.(runStream);
      if (!nextRun) throw new Error("Next run result is undefined");

      return this.handleRunResult(nextRun, options);
    } else {
      const nextRun = await openai.beta.threads.runs.submitToolOutputsAndPoll(
        this.threadId,
        run.id,
        { tool_outputs: toolOutputs },
      );

      return this.handleRunResult(nextRun, options);
    }
  }

  private sendToolDataMessage(
    toolCall: RequiredActionFunctionToolCall,
    toolOutput: RunSubmitToolOutputsParams.ToolOutput,
  ): void {
    this.runContext?.sendDataMessage?.({
      id: toolOutput.tool_call_id,
      role: "data",
      data: JSON.stringify({
        input: toolCall.function,
        output: toolOutput.output,
      }),
    });
  }
}
