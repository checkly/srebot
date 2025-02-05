import { openai } from "@ai-sdk/openai";
import { LanguageModelV1 } from "ai";

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

export const defaultPromptConfig: PromptConfig = {
  model,
};

export function promptConfig(config?: Partial<PromptConfig>) {
  return {
    ...defaultPromptConfig,
    ...config,
  };
}
