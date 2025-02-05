import { openai } from "@ai-sdk/openai";
import { LanguageModelV1 } from "ai";

export const model = openai("gpt-4o");
export const temperature = 0;

export interface PromptConfig {
  model: LanguageModelV1;
  temperature?: number;
  maxTokens?: number;
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
