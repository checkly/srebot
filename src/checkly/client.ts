import { ChecklyClient } from "./checklyclient";
import "dotenv/config";

export const checkly: ChecklyClient = new ChecklyClient();
