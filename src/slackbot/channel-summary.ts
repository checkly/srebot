import { generateObject } from "ai";
import { convertSlackTimestamp, fetchHistoricalMessages } from "./utils";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export const generateChannelSummary = async (
  channelId: string,
  prompt: string,
  fromTimestamp?: string
) => {
  const fromDate = fromTimestamp
    ? new Date(fromTimestamp)
    : new Date(Date.now() - 1000 * 60 * 60 * 24);
  const messages = await fetchHistoricalMessages(channelId, 100, fromDate);
  const messageHistory = messages
    ?.map(
      (m) =>
        `${convertSlackTimestamp(m.ts!).toISOString()} Message: ${m.plaintext}`
    )
    .join("\n");

  const {
    object: { summary, relevantLinks },
  } = await generateObject({
    temperature: 0,
    model: openai("gpt-4o"),
    prompt: `You are a Slack channel context collector. Your task is to analyze the given message history based on a specific prompt and provide a concise summary of the relevant context.

Here is the message history from the Slack channel:
<message_history>
${messageHistory}
</message_history>

This is the prompt:
${prompt}

To complete the task, follow these steps:
1. Carefully read through the entire message history.
2. Identify the main topics, themes, or discussions that are relevant to the prompt.
3. Create a concise summary of the channel's content related to the prompt, highlighting the most relevant and important information. Your summary should be no longer than 3-5 sentences.`,
    schema: z.object({
      summary: z
        .string()
        .describe(`Concise summary based on the following question: ${prompt}`),
      relevantLinks: z
        .array(z.object({ url: z.string(), title: z.string() }))
        .describe(
          "Links that are relevant to the given question or the channel summary."
        ),
    }),
  });

  return { summary, relevantLinks };
};
