import { initConfig } from "../lib/init-config";
import { log } from "../log";

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
    migrations: {
      directory: "./migrations", // Directory where migration files are stored
      extension: "ts", // Migration files will be TypeScript
    },
  },
  dev: {
    client: "pg",
    connection: dbUrlEnv,
    pool: { min: 2, max: 10 },
    debug: false,
    migrations: {
      directory: "./migrations", // Directory where migration files are stored
      extension: "ts", // Migration files will be TypeScript
    },
  },
  production: {
    client: "pg",
    connection: dbUrlEnv,
    pool: { min: 2, max: 20 },
    migrations: {
      directory: "./migrations", // Directory where migration files are stored
      extension: "ts", // Migration files will be TypeScript
    },
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
