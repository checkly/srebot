import { initConfig } from "../lib/init-config";
import { ChecklyClient } from "./checklyclient";

initConfig();

export const checkly: ChecklyClient = new ChecklyClient();
