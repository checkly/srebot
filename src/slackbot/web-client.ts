import { WebClient } from "@slack/web-api";
import dotenv from "dotenv";

dotenv.config();

export const web = new WebClient(process.env.SLACK_AUTH_TOKEN);
