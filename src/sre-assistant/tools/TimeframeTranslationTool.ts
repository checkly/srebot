import { generateObject } from "ai";
import moment from "moment";
import { z } from "zod";
import { getOpenaiSDKClient } from "../../ai/openai";
import { createToolOutput, createToolParameters, Tool } from "../../ai/Tool";
import { SreAssistant } from "../SreAssistant";

// Define supported timeframe formats for better type safety and documentation
export enum TimeframeFormat {
  ABSOLUTE = "absolute",    // e.g., "today", "yesterday"
  RELATIVE = "relative",    // e.g., "last 7 days"
  REFERENCE = "reference"   // e.g., "since last deployment"
}

// Enhanced parameters schema with validation
const parameters = createToolParameters(
  z.object({
    timeframe: z
      .string()
      .min(1)
      .describe(
        "A natural language description of the timeframe to convert into a timestamp range."
      ),
    format: z
      .enum([TimeframeFormat.ABSOLUTE, TimeframeFormat.RELATIVE, TimeframeFormat.REFERENCE])
      .optional()
      .describe("Optional format specification for the timeframe interpretation"),
  })
);

// Enhanced output schema with additional metadata
const outputSchema = createToolOutput(
  z.object({
    start: z.string().describe("The start of the timeframe as an ISO 8601 timestamp."),
    end: z.string().describe("The end of the timeframe as an ISO 8601 timestamp."),
    interpretation: z
      .string()
      .describe("Human-readable explanation of how the timeframe was interpreted"),
  })
);

export class TimeframeTranslationTool extends Tool<
  typeof parameters,
  typeof outputSchema,
  SreAssistant
> {
  private static readonly REGEX_PATTERNS = {
    relativeDays: /in (?:the )?last (\d+) days/i,
    relativeHours: /in (?:the )?last (\d+) hours?/i,
    specificDate: /(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2} [A-Za-z]+ \d{4})/i,
  };

  private static readonly TIMEFRAME_RULES: Record<
    string,
    (now: moment.Moment) => { start: moment.Moment; end: moment.Moment }
  > = {
    today: (now) => ({
      start: now.clone().startOf("day"),
      end: now.clone().endOf("day"),
    }),
    yesterday: (now) => ({
      start: now.clone().subtract(1, "day").startOf("day"),
      end: now.clone().subtract(1, "day").endOf("day"),
    }),
    "this week": (now) => ({
      start: now.clone().startOf("week"),
      end: now.clone().endOf("week"),
    }),
    "last week": (now) => ({
      start: now.clone().subtract(1, "week").startOf("week"),
      end: now.clone().subtract(1, "week").endOf("week"),
    }),
    "this month": (now) => ({
      start: now.clone().startOf("month"),
      end: now.clone().endOf("month"),
    }),
    "last month": (now) => ({
      start: now.clone().subtract(1, "month").startOf("month"),
      end: now.clone().subtract(1, "month").endOf("month"),
    }),
    "this quarter": (now) => ({
      start: now.clone().startOf("quarter"),
      end: now.clone().endOf("quarter"),
    }),
    "last quarter": (now) => ({
      start: now.clone().subtract(1, "quarter").startOf("quarter"),
      end: now.clone().subtract(1, "quarter").endOf("quarter"),
    }),
  };

  constructor(agent: SreAssistant) {
    super({
      name: "TimeframeTranslationTool",
      description: "Converts human-readable timeframes into ISO 8601 timestamp ranges.",
      parameters,
      agent,
    });
  }

  async execute(input: z.infer<typeof parameters>): Promise<z.infer<typeof outputSchema>> {
    try {
      // First attempt rule-based parsing
      const ruleBasedResult = this.parseTimeframe(input.timeframe);
      if (ruleBasedResult) {
        return {
          ...ruleBasedResult,
          interpretation: `Matched exact rule: ${input.timeframe}`,
        };
      }

      // Then try regex patterns
      const regexResult = this.parseWithRegex(input.timeframe);
      if (regexResult) {
        return {
          ...regexResult,
          interpretation: `Matched pattern: ${input.timeframe}`,
        };
      }

      // Fall back to LLM-based parsing
      return this.parseLLM(input.timeframe);
    } catch (error) {
      throw new Error(`Failed to parse timeframe: ${error.message}`);
    }
  }

  private parseTimeframe(
    timeframe: string
  ): { start: string; end: string } | null {
    const now = moment();
    const rule = TimeframeTranslationTool.TIMEFRAME_RULES[timeframe.toLowerCase()];

    if (rule) {
      const { start, end } = rule(now);
      return {
        start: start.toISOString(),
        end: end.toISOString(),
      };
    }

    return null;
  }

  private parseWithRegex(
    timeframe: string
  ): { start: string; end: string } | null {
    const now = moment();

    // Check relative days
    const daysMatch = timeframe.match(TimeframeTranslationTool.REGEX_PATTERNS.relativeDays);
    if (daysMatch) {
      const days = parseInt(daysMatch[1], 10);
      return {
        start: now.clone().subtract(days, "days").startOf("day").toISOString(),
        end: now.clone().endOf("day").toISOString(),
      };
    }

    // Check relative hours
    const hoursMatch = timeframe.match(TimeframeTranslationTool.REGEX_PATTERNS.relativeHours);
    if (hoursMatch) {
      const hours = parseInt(hoursMatch[1], 10);
      return {
        start: now.clone().subtract(hours, "hours").toISOString(),
        end: now.toISOString(),
      };
    }

    // Check specific date
    const dateMatch = timeframe.match(TimeframeTranslationTool.REGEX_PATTERNS.specificDate);
    if (dateMatch) {
      const date = moment(dateMatch[1]);
      if (date.isValid()) {
        return {
          start: date.startOf("day").toISOString(),
          end: date.endOf("day").toISOString(),
        };
      }
    }

    return null;
  }

  private async parseLLM(
    timeframe: string
  ): Promise<z.infer<typeof outputSchema>> {
    const generated = await generateObject({
      model: getOpenaiSDKClient()("gpt-4o"),
      prompt: `Parse the following timeframe into a precise timestamp range with  and interpretation.

      Input: "${timeframe}"

      Return a JSON object with:
      - start: ISO 8601 timestamp for range start
      - end: ISO 8601 timestamp for range end
      - confidence: number between 0-1 indicating parsing confidence
      - interpretation: explanation of how the timeframe was interpreted

      Consider current date: ${moment().format('YYYY-MM-DD')}`,
      schema: outputSchema,
      experimental_telemetry: {
        isEnabled: true,
      },
    });

    return generated.object
  }
}
