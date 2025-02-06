import dotenv from "dotenv";
import path from "path";

// Load the .env file
// This allows us to run any file as an entry point from any working directory
export const initConfig = () => {
  const envPath = path.resolve(__dirname, "../..", ".env");
  dotenv.config({ path: envPath });
};
