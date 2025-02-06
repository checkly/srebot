import { createOpenAI } from "@ai-sdk/openai";
import { OpenAI } from "openai";
import dotenv from "dotenv";

dotenv.config();

export const getOpenaiClient = () =>
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

export const getOpenaiSDKClient = () =>
  createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
