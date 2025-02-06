import moment from "moment";
import { PromptConfig, promptConfig } from "./common";

export function parseTimeframePrompt(
  timeframe: string,
): [string, PromptConfig] {
  return [
    `Parse the following timeframe into a precise timestamp range with  and interpretation.

      Input: "${timeframe}"

      Return a JSON object with:
      - start: ISO 8601 timestamp for range start
      - end: ISO 8601 timestamp for range end
      - confidence: number between 0-1 indicating parsing confidence
      - interpretation: explanation of how the timeframe was interpreted

      Consider current date: ${moment().format("YYYY-MM-DD")}`,
    promptConfig(),
  ];
}
