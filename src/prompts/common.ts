import { openai } from "@ai-sdk/openai";
import { CoreMessage, LanguageModel, LanguageModelV1, Message } from "ai";
import { trace } from "@opentelemetry/api";
import { z, ZodSchema } from "zod";
export const model = openai("gpt-4o");

export interface PromptConfig {
  model: LanguageModel;
  temperature?: number;
  maxTokens?: number;
  system?: string;
  experimental_telemetry?: {
    isEnabled: boolean;
    functionId: string;
  };
}

export type PromptDefinition<
  T extends "array" | "object" | "enum" | "no-schema" = "object",
> = PromptConfig & {
  prompt?: string;
  messages?: CoreMessage[];
  schema: z.Schema<any, z.ZodTypeDef, any>;
  output: T;
};

export type PromptDefinitionForText = Omit<
  PromptDefinition,
  "schema" | "output"
>;

export function promptConfig(id: string, config?: Partial<PromptConfig>) {
  return {
    model,
    experimental_telemetry: {
      isEnabled: true,
      functionId: id,
      metadata: {
        ...langfuseTraceIdFromOtel(),
      },
    },
    ...config,
  };
}

export function definePrompt<
  T extends "array" | "object" | "enum" | "no-schema" = "object",
>(
  id: string,
  prompt: string,
  schema: ZodSchema,
  config?: Partial<PromptConfig> & { output?: T },
): PromptDefinition<T> & { output: T } {
  return {
    output: "object" as T, // type assertion here since we know config.output will override if provided
    prompt,
    schema,
    ...promptConfig(id, config),
  };
}

export function defineMessagesPrompt<
  T extends "array" | "object" | "enum" | "no-schema" = "object",
>(
  id: string,
  messages: CoreMessage[],
  schema: ZodSchema,
  config?: Partial<PromptConfig> & { output?: T },
): PromptDefinition<T> & { output: T } {
  return {
    output: "object" as T, // type assertion here since we know config.output will override if provided
    messages,
    schema,
    ...promptConfig(id, config),
  };
}

function langfuseTraceIdFromOtel() {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return null;

  const context = activeSpan.spanContext();
  return {
    langfuseTraceId: context.traceId,
    langfuseUpdateParent: false, // Do not update the parent trace with execution results
  };
}
