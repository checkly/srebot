import { createOpenAI } from "@ai-sdk/openai";
import { OpenAI } from "openai";

export const getOpenaiClient = () =>
	new OpenAI({
		apiKey: process.env.OPENAI_API_KEY,
	});

export const getOpenaiSDKClient = () =>
	createOpenAI({
		apiKey: process.env.OPENAI_API_KEY,
	});
