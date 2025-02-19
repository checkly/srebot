import { openai } from "@ai-sdk/openai";
import { LanguageModelV1 } from "ai";
import { trace } from "@opentelemetry/api";
import { z, ZodSchema } from "zod";
export const model = openai("gpt-4o");

export interface PromptConfig {
  model: LanguageModelV1;
  temperature?: number;
  maxTokens?: number;
  system?: string;
  output?: "object" | undefined;
  experimental_telemetry?: {
    isEnabled: boolean;
    functionId: string;
  };
}

export type PromptDefinition = PromptConfig & {
  prompt: string;
  schema: z.Schema<any, z.ZodTypeDef, any>;
};

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

export function definePrompt(
  id: string,
  prompt: string,
  schema: ZodSchema,
  config?: Partial<PromptConfig>,
): PromptDefinition {
  return {
    prompt,
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
