import { createOpenAI } from "@ai-sdk/openai";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import dotenv from "dotenv";
import { LangfuseExporter } from "langfuse-vercel";
import { OpenAI } from "openai";

dotenv.config();

export const telemetrySDK = new NodeSDK({
  traceExporter: new LangfuseExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

export const getOpenaiClient = () =>
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

export const getOpenaiSDKClient = () =>
  createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
