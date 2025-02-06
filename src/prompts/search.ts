import { JsonValue } from "@prisma/client/runtime/library";
import { PromptConfig, promptConfig } from "./common";

interface SearchContextRowForPrompt {
  key: string;
  value: JsonValue;
}

export function searchContextPrompt(
  query: string,
  contextRows: SearchContextRowForPrompt[],
): [string, PromptConfig] {
  const config = promptConfig({
    maxTokens: 1000,
  });

  return [
    `You are an AI assistant tasked with searching through a given context based on a user's query. Your goal is to find and return the most relevant information from the context that relates to the query.

Here is the context you will be searching through:
<context>
${contextRows.map((c) => c.key + ": " + JSON.stringify(c.value)).join("\n")}
</context>

The user's query is:
<query>${query}</query>

To complete this task, follow these steps:

1. Carefully read and analyze both the context and the query.
2. Identify key words, phrases, or concepts in the query that you should look for in the context.
3. Search through the context to find sections that are most relevant to the query. Consider both exact matches and semantically similar information.
4. Determine the relevance of each potential match by considering:
   - How closely it relates to the query
   - How completely it answers the query (if applicable)
   - The importance of the information in the context of the query
5. Select the most relevant section(s) of the context. If multiple sections are equally relevant, you may include more than one.

Remember:
- Stay focused on the query and only return information that is directly relevant.
- Do not add any information that is not present in the given context.
- If the query asks a specific question, prioritize information that directly answers that question.
- Be concise in your explanations, but make sure they clearly justify the relevance of the selected text.`,
    config,
  ];
}
