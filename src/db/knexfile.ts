import { initConfig } from "../lib/init-config";
import { log } from "../slackbot/log";

initConfig();

const dbUrlEnv = process.env.DATABASE_URL;
if (!dbUrlEnv) {
  throw new Error("DATABASE_URL is not set in environment variables.");
}

const config = {
  local: {
    client: "pg",
    connection: dbUrlEnv,
    pool: { min: 2, max: 10 },
    debug: false,
  },
  dev: {
    client: "pg",
    connection: dbUrlEnv,
    pool: { min: 2, max: 10 },
    debug: false,
  },
  production: {
    client: "pg",
    connection: dbUrlEnv,
    pool: { min: 2, max: 20 },
  },
};

const currentConfig = config[process.env.NODE_ENV || "local"];

log.info(
  {
    env: process.env.NODE_ENV || "local",
  },
  "Loading Knex config",
);

export default currentConfig;
