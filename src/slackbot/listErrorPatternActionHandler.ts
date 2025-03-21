import { findErrorClusters } from "../db/error-cluster";
import { last24h } from "../prompts/checkly-data";
import { createErrorPatternsBlock } from "./blocks/errorPatternBlock";

export const listErrorPatternActionHandler = () => {
  return async ({ ack, respond, body }) => {
    await ack();
    const errorPatternIds = body.actions[0].value.split(",");

    const errorPatterns = await findErrorClusters(errorPatternIds, last24h());

    const message = createErrorPatternsBlock(errorPatterns);
    await respond({
      replace_original: false,
      response_type: "in_channel",
      ...message,
    });
  };
};
