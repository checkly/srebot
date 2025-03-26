import { checkly } from "../checkly/client";
import { last24h } from "../prompts/checkly-data";
import { log } from "../log";
import { App, StringIndexed } from "@slack/bolt";
import { analyseMultipleChecks } from "../use-cases/analyse-multiple/analyse-multiple-checks";
import { createMultipleCheckAnalysisBlock } from "./blocks/multipleChecksAnalysisBlock";
import { accountSummary } from "./accountSummaryCommandHandler";
import { checkSummary } from "./commands/check-summary";

// Allow overriding the command name for local dev
export const CHECKLY_COMMAND_NAME =
  process.env.CHECKLY_COMMAND_NAME_OVERRIDE || "/checkly";

const getIsUUID = (str: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    str,
  );
};

export const checklyCommandHandler = (app: App<StringIndexed>) => {
  return async ({ ack, respond, command }) => {
    await ack();
    const args = command.text.split(" ");
    if (args.length == 1 && args[0].trim() === "") {
      const accountId = process.env.CHECKLY_ACCOUNT_ID!;
      const account = await checkly.getAccount(accountId);
      const interval = last24h(new Date());

      const response = await app.client.chat.postMessage({
        channel: command.channel_id,
        text: `Analysing account \`${account.name}\`... ⏳`,
      });

      try {
        const { message } = await accountSummary(accountId, interval);

        await app.client.chat.update({
          channel: command.channel_id,
          ts: response.ts,
          ...message,
        } as any);
      } catch (err) {
        // Ensure we have a proper Error object
        const error = err instanceof Error ? err : new Error(String(err));

        log.error(
          {
            err: error,
            accountId,
          },
          "Error fetching account summary",
        );

        await respond({
          replace_original: true,
          text: `:x: Error fetching account summary: ${error.message}`,
        });
      }
    } else if (args.length === 1 && !!args[0] && getIsUUID(args[0])) {
      const checkId = args[0];
      try {
        // It is not possible to remove ephemeral messages or update them
        const response = await app.client.chat.postMessage({
          channel: command.channel_id,
          text: `Analyzing check \`${checkId}\`... ⏳`,
        });

        const { message } = await checkSummary(checkId);

        await app.client.chat.update({
          channel: command.channel_id,
          ts: response.ts,
          ...message,
        } as any);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log.error(
          {
            err: error,
            checkId,
          },
          "Error preparing check summary",
        );

        await respond({
          replace_original: true,
          text: `:x: Error analysing check summary: ${error.message}`,
        });
      }
    } else {
      await respond({
        text: "Please provide either a valid check id or no arguments for Account wide analysis",
      });
    }
  };
};
