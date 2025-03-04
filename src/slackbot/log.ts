import { pino } from "pino";

export const log = pino({
  transport: {
    target: "pino-logfmt",
  },
});
