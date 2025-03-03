import { expect } from "@jest/globals";
import dotenv from "dotenv";
import { CHECKLY_COMMAN_NAME, checklyCommandHandler } from "./checkly";

dotenv.config();

describe("Checkly Slack Message Tests", () => {
  it.skip("Summarize a single Check Result and send a Slack Notification", async () => {
    const CHECK_ID = "dd89cce7-3eec-4786-8e0e-0e5f3b3647b4";
    const CHECK_RESULT_ID = "aac7e993-2aba-42f8-a655-54f4cdc22473";

    const result = await checklyCommandHandler({
      ack: () => Promise.resolve(),
      respond: () => Promise.resolve(),
      command: {
        text: `${CHECKLY_COMMAN_NAME} ${CHECK_ID} ${CHECK_RESULT_ID}`,
      },
    });
    // Assert
    expect(result).toBeDefined();
  }, 300000);

  it.skip("Summarize a Check and send a Slack Notification", async () => {
    const CHECK_ID = "dd89cce7-3eec-4786-8e0e-0e5f3b3647b4";

    const result = await checklyCommandHandler({
      ack: () => Promise.resolve(),
      respond: () => Promise.resolve(),
      command: {
        text: `${CHECKLY_COMMAN_NAME} ${CHECK_ID}`,
      },
    });

    // Assert
    expect(result).toBeDefined();
  }, 300000);
});
