import { LogLevel } from "@slack/bolt";

interface SlackConfig {
  signingSecret: string;
  token: string;
  appToken: string;
  socketMode: boolean;
  logLevel: LogLevel;
}

export const getSlackConfig = (): SlackConfig => ({
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  token: process.env.SLACK_AUTH_TOKEN!,
  appToken: process.env.SLACK_APP_TOKEN!,
  socketMode: true,
  logLevel:
    process.env.NODE_ENV !== "production" ? LogLevel.DEBUG : LogLevel.INFO,
});

export const validateConfig = (config: SlackConfig): void => {
  const requiredEnvVars = [
    "SLACK_SIGNING_SECRET",
    "SLACK_AUTH_TOKEN",
    "SLACK_APP_TOKEN",
  ];

  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
  }
};
