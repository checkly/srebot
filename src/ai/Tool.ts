import { tool } from "ai";
import type { AssistantTool } from "openai/src/resources/beta/assistants.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BaseAssistant } from "./Assistant";

// Custom error class for tool-related errors
export class ToolError extends Error {
	constructor(message: string, public readonly code: string) {
		super(message);
		this.name = "ToolError";
	}
}

/**
 * Abstract base class for creating tools with type-safe parameters and outputs
 */
export abstract class Tool<
	TParams extends z.ZodType = z.ZodType,
	TOutput extends z.ZodType = z.ZodType,
	TAgent extends BaseAssistant = BaseAssistant
> {
	protected readonly name: string;
	protected readonly description: string;
	protected readonly parameters: TParams;
	protected readonly agent: TAgent;
	protected readonly outputSchema?: TOutput;
	protected readonly version: string = "1.0.0";
	protected readonly maxRetries: number = 1;
	protected readonly timeout?: number;

	constructor(config: {
		name: string;
		description: string;
		parameters: TParams;
		agent: TAgent;
		outputSchema?: TOutput;
		version?: string;
		maxRetries?: number;
		timeout?: number;
	}) {
		this.validateConfig(config);

		this.name = config.name;
		this.description = config.description;
		this.parameters = config.parameters;
		this.agent = config.agent;
		this.outputSchema = config.outputSchema;
		this.version = config.version ?? this.version;
		this.maxRetries = config.maxRetries ?? this.maxRetries;
		this.timeout = config.timeout;
	}

	/**
	 * Validate tool configuration
	 */
	private validateConfig(config: {
		name: string;
		description: string;
		parameters: TParams;
		agent: TAgent;
	}): void {
		if (!config.name?.trim()) {
			throw new ToolError("Tool name is required", "INVALID_NAME");
		}
		if (!config.description?.trim()) {
			throw new ToolError(
				"Tool description is required",
				"INVALID_DESCRIPTION"
			);
		}
		if (!config.parameters) {
			throw new ToolError(
				"Tool parameters schema is required",
				"INVALID_PARAMETERS"
			);
		}
		if (!config.agent) {
			throw new ToolError("Agent instance is required", "INVALID_AGENT");
		}
	}

	/**
	 * Get tool metadata
	 */
	public getMetadata() {
		return {
			name: this.name,
			description: this.description,
			version: this.version,
			parameters: zodToJsonSchema(this.parameters),
			outputSchema: this.outputSchema
				? zodToJsonSchema(this.outputSchema)
				: undefined,
		};
	}

	/**
	 * Abstract method to implement tool's core functionality
	 */
	protected abstract execute(
		input: z.infer<TParams>
	): Promise<z.infer<TOutput>> | z.infer<TOutput>;

	/**
	 * Run the tool with validation and error handling
	 */
	public async run(input: z.infer<TParams>): Promise<z.infer<TOutput>> {
		// Validate input parameters
		const validatedInput = await this.parameters.parseAsync(input);

		// Execute with retry logic and timeout
		const output = await this.executeWithRetry(validatedInput);

		// Validate output if schema is provided
		if (this.outputSchema) {
			await this.outputSchema.parseAsync(output);
		}

		return output;
	}

	/**
	 * Execute with retry logic and timeout
	 */
	private async executeWithRetry(
		input: z.infer<TParams>,
		attempt: number = 1
	): Promise<z.infer<TOutput>> {
		try {
			if (this.timeout) {
				return await this.executeWithTimeout(input);
			}
			return await this.execute(input);
		} catch (error) {
			if (attempt >= this.maxRetries) {
				throw error;
			}
			// Exponential backoff
			await new Promise((resolve) =>
				setTimeout(resolve, Math.pow(2, attempt) * 1000)
			);
			return this.executeWithRetry(input, attempt + 1);
		}
	}

	/**
	 * Execute with timeout
	 */
	private async executeWithTimeout(
		input: z.infer<TParams>
	): Promise<z.infer<TOutput>> {
		if (!this.timeout) return this.execute(input);

		return Promise.race([
			this.execute(input),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new ToolError("Execution timeout", "TIMEOUT")),
					this.timeout
				)
			),
		]);
	}

	/**
	 * Convert to OpenAI Assistant Tool format
	 */
	public toAssistantTool(): AssistantTool {
		return {
			type: "function",
			function: {
				name: this.name,
				description: this.description,
				parameters: zodToJsonSchema(this.parameters) as Record<string, unknown>,
			},
		};
	}

	/**
	 * Convert to Vercel AI SDK Tool format
	 */
	public toAISdkTool() {
		return {
			[this.name]: tool({
				description: this.description,
				parameters: this.parameters,
				execute: async (input: z.infer<TParams>) => {
					const result = await this.run(input);
					return JSON.stringify(result.data);
				},
			}),
		};
	}
}

/**
 * Type helper for creating tool parameters
 */
export const createToolParameters = <T extends z.ZodType>(schema: T) => schema;

/**
 * Type helper for creating tool output schema
 */
export const createToolOutput = <T extends z.ZodType>(schema: T) => schema;
