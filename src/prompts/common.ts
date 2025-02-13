import { openai } from "@ai-sdk/openai";
import { LanguageModelV1 } from "ai";
import { trace } from "@opentelemetry/api";
export const model = openai("gpt-4o");

export interface PromptConfig {
  model: LanguageModelV1;
  temperature?: number;
  maxTokens?: number;
  system?: string;
  experimental_telemetry?: {
    isEnabled: boolean;
    functionId: string;
  };
}

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

function langfuseTraceIdFromOtel() {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return null;

  const context = activeSpan.spanContext();
  return {
    langfuseTraceId: context.traceId,
    langfuseUpdateParent: false, // Do not update the parent trace with execution results
  };
}
