import { expect } from "@jest/globals";
import dotenv from "dotenv";
import { CHECKLY_COMMAND_NAME, checklyCommandHandler } from "./checkly";

dotenv.config();

describe("Checkly Slack Message Tests", () => {
  it.skip("Summarize a single Check Result and send a Slack Notification", async () => {
    const CHECK_ID = "dd89cce7-3eec-4786-8e0e-0e5f3b3647b4";
    const CHECK_RESULT_ID = "aac7e993-2aba-42f8-a655-54f4cdc22473";

    await checklyCommandHandler({
      ack: () => Promise.resolve(),
      respond: () => Promise.resolve(),
      command: {
        text: `${CHECKLY_COMMAND_NAME} ${CHECK_ID} ${CHECK_RESULT_ID}`,
      },
    });
    // Assert
  }, 300000);

  it.skip("Summarize a Check and send a Slack Notification", async () => {
    const CHECK_ID = "dd89cce7-3eec-4786-8e0e-0e5f3b3647b4";

    await checklyCommandHandler({
      ack: () => Promise.resolve(),
      respond: () => Promise.resolve(),
      command: {
        text: `${CHECKLY_COMMAND_NAME} ${CHECK_ID}`,
      },
    });
  }, 300000);
});
