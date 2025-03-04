import { initConfig } from "./src/lib/init-config";

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
    debug: true,
  },
  dev: {
    client: "pg",
    connection: dbUrlEnv,
    pool: { min: 2, max: 10 },
    debug: true,
  },
  production: {
    client: "pg",
    connection: dbUrlEnv,
    pool: { min: 2, max: 20 },
  },
};

const currentConfig = config[process.env.NODE_ENV || "local"];

console.log(`msg="Loading Knex config" env=${process.env.NODE_ENV || "local"}`);

export default currentConfig;
