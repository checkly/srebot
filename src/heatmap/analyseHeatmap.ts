import { ChecklyClient } from "../checkly/checklyclient";
import fs from "fs";
import { generateHeatmapPNG } from "./createHeatmap";
import { CheckResult } from "../checkly/models";
import { getOpenaiClient } from "../ai/openai";
import { initConfig } from "../lib/init-config";

initConfig();
const checklyClient = new ChecklyClient();

const getResult = async (checkId) => {
  return await checklyClient.getCheckResultsByCheckId(checkId, {
    from: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    to: new Date(Date.now()),
    resultType: "ALL",
  });
};

const getCachedResult = async (checkId) => {
  try {
    const path = `${process.cwd()}/test-data/results-${checkId}.json`;
    const data = fs.readFileSync(path, "utf8");

    return JSON.parse(data);
  } catch (e) {
    return null;
  }
};

const saveCache = async (results: CheckResult[], checkId) => {
  const path = `${process.cwd()}/test-data/results-${checkId}.json`;
  fs.writeFileSync(path, JSON.stringify(results), "utf8");
};

export async function analyzeImageBufferForPatterns(imageBuffer: Buffer) {
  try {
    const openai = getOpenaiClient();
    // Convert buffer to base64
    const base64Image = imageBuffer.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
      The attached heatmap visualization shows check failures over time and across regions.

      Explanation:
      - X-axis: Time buckets in ascending order (not all are labelled)
      - Y-axis: Run locations - regions where the check is executed
      - Color intensity: Proportion of failing check results to all results in a specific location and time bucket.
        Gray: no data - no check runs in that bucket
        Green: no failures
        Red: high proportion of failures

      Questions:
      - Is the check a flaky one?
      - Which regions are affected by the current event?
      - Are only specific regions flaky?

      CONSTITUTION:
      - Focus on identifying patterns and anomalies.
      - Provide a clear analysis of regional impacts.
      - Highlight if specific regions show consistent flakiness.
      - Be concise and on point, no yapping.
      - Use simple formatting for clarity, no emojis
      - do not use markdown formatting
      `,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 300,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
}

export const analyseHeatmap = async (checkId: string) => {
  const check = await checklyClient.getCheck(checkId);
  const checkGroup = check.groupId
    ? await checklyClient.getCheckGroup(check.groupId)
    : null;

  const results =
    (await getCachedResult(checkId)) || (await getResult(checkId));
  await saveCache(results, checkId);
  const locations = checkGroup?.locations || check.locations; // I hate this

  const bucketSizeInMinutes = check.frequency * locations.length * 2; // make sure each bucket has at least 2 results
  const buffer = generateHeatmapPNG(results, {
    outputFilePath: `test-data/heatmap-${checkId}.png`,
    bucketSizeInMinutes,
    verticalSeries: locations.length,
  });

  console.log(await analyzeImageBufferForPatterns(buffer));
};
