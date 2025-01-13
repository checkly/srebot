import {z} from "zod";
import { prisma } from "../../prisma";
import {Tool, createToolParameters, createToolOutput} from "../../ai/Tool";
import {SreAssistant} from "../SreAssistant";

const parameters = createToolParameters(
  z.object({
    accountId: z
      .string()
      .describe(
        "A 32 bit unique identifier for the account that the user is querying about."
      ),
    apiKey: z.string().describe("The API key for the account. This is "),
  })
);

const outputSchema = createToolOutput(
  z.object({
    success: z.boolean().describe("Whether the operation was successful"),
  })
);

export class UserContextTool extends Tool<
  typeof parameters,
  typeof outputSchema,
  SreAssistant
> {
  static parameters = parameters;
  static outputSchema = outputSchema;

  constructor(agent: SreAssistant) {
    super({
      name: "UserContextTool",
      description:
        "Persist user context across executions. This tool allows you to store and retrieve user context data. When user asks yuo to remember something (account id), you can use this tool to store that information.",
      parameters,
      agent,
    });
  }

  async execute(input: z.infer<typeof parameters>) {
    const {accountId} = input;

    // Get the username from the agent's interaction context
    const username = this.agent.interactionContext?.username;
    console.log("Attempting to create context for user:", username, accountId);
    if (!username) {
      throw new Error("Username is missing in the interaction context.");
    }

    try {
      // Upsert the UserContext record in the database
      await prisma.userContext.upsert({
        where: {username},
        update: {accountId},
        create: {username, accountId},
      });

      return {success: true};
    } catch (error) {
      console.error("Failed to persist user context:", error);
      return {success: false};
    }
  }
}
