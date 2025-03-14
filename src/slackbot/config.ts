import { pinoBoltLogger } from "../log";
import { Logger, LogLevel } from "@slack/bolt";
import process from "node:process";

interface SlackConfig {
  signingSecret: string;
  token: string;
  appToken: string;
  socketMode: boolean;
  logLevel: LogLevel;
  logger: Logger;
}

export const getSlackConfig = (): SlackConfig => ({
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  token: process.env.SLACK_AUTH_TOKEN!,
  appToken: process.env.SLACK_APP_TOKEN!,
  socketMode: true,
  logger: pinoBoltLogger,
  logLevel: LogLevel.INFO,
});

export const validateConfig = (): void => {
  const requiredEnvVars = [
    "SLACK_SIGNING_SECRET",
    "SLACK_AUTH_TOKEN",
    "SLACK_APP_TOKEN",
  ];

  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName],
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`,
    );
  }
};
