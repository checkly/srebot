import dotenv from "dotenv";

dotenv.config();

const dbUrlEnv = process.env.DATABASE_URL;

const config = {
  local: {
    client: "postgresql",
    connection: dbUrlEnv,
  },
  dev: {
    client: "postgresql",
    connection: dbUrlEnv,
  },
  production: {
    client: "postgresql",
    connection: dbUrlEnv,
  },
};

const currentConfig = config[process.env.NODE_ENV || "local"];

export default currentConfig;
