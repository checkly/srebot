import { generateObject } from "ai";
import { convertSlackTimestamp, fetchHistoricalMessages } from "./utils";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { channelSummaryPrompt } from "src/prompts/slack";

export const generateChannelSummary = async (
  channelId: string,
  prompt: string,
  fromTimestamp?: string,
) => {
  const fromDate = fromTimestamp
    ? new Date(fromTimestamp)
    : new Date(Date.now() - 1000 * 60 * 60 * 24);
  const messages = await fetchHistoricalMessages(channelId, 100, fromDate);

  const {
    object: { summary, relevantLinks },
  } = await generateObject({
    temperature: 0,
    model: openai("gpt-4o"),
    prompt: channelSummaryPrompt(prompt, messages),
    schema: z.object({
      summary: z
        .string()
        .describe(`Concise summary based on the following question: ${prompt}`),
      relevantLinks: z
        .array(z.object({ url: z.string(), title: z.string() }))
        .describe(
          "Links that are relevant to the given question or the channel summary.",
        ),
    }),
  });

  return { summary, relevantLinks };
};
