import { findErrorClusters } from "../db/error-cluster";
import { last24h } from "../prompts/checkly-data";
import { createErrorPatternsBlock } from "./blocks/errorPatternBlock";

export const listErrorPatternActionHandler = (app) => {
  return async ({ ack, body }) => {
    await ack();
    const errorPatternIds = body.actions[0].value.split(",");

    const errorPatterns = await findErrorClusters(errorPatternIds, last24h());

    const message = createErrorPatternsBlock(errorPatterns);

    await app.client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: body.message.ts,
      ...message,
    });
  };
};
