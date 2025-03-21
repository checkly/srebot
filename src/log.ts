import { pino } from "pino";
import process from "node:process";
import { LogLevel } from "@slack/bolt";

// Allows to override log level
const logLevel =
  process.env.LOG_LEVEL || process.env.NODE_ENV === "production"
    ? "info"
    : "debug";

export const log = pino({
  level: logLevel,
  transport: {
    target: "pino-logfmt",
    options: {
      flattenNestedObjects: true,
      convertToSnakeCase: true,
      includeLevelLabel: true,
      formatTime: true,
    },
  },
});

export const pinoBoltLogger = {
  setLevel: (level: LogLevel) => {
    switch (level) {
      case LogLevel.DEBUG:
        log.level = "debug";
        break;
      case LogLevel.INFO:
        log.level = "info";
        break;
      case LogLevel.WARN:
        log.level = "warn";
        break;
      case LogLevel.ERROR:
        log.level = "error";
        break;
    }
  },
  getLevel: () => {
    switch (log.level) {
      case "trace":
        return LogLevel.DEBUG;
      case "debug":
        return LogLevel.DEBUG;
      case "info":
        return LogLevel.INFO;
      case "warn":
        return LogLevel.WARN;
      case "error":
        return LogLevel.ERROR;
      case "fatal":
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  },
  setName: () => {},
  debug: (...msgs: unknown[]) => log.debug(msgs),
  info: (...msgs: unknown[]) => log.info(msgs),
  warn: (...msgs: unknown[]) => log.warn(msgs),
  error: (...msgs: unknown[]) => log.error(msgs),
};
