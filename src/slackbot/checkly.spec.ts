import { expect } from "@jest/globals";
import { WebClient } from "@slack/web-api";
import dotenv from "dotenv";
import {
  summarizeErrorsPrompt,
  SummarizeErrorsPromptType,
} from "../prompts/checkly";
import { generateObject } from "ai";
import { ChecklyClient } from "../checkly/checklyclient";
import {
  fetchCheckResults,
  summarizeCheckResult,
  LAST_30_DAYS,
  last24h,
} from "../prompts/checkly-data";
import { CheckResult } from "../checkly/models";
import { createHeatmap, generateHeatmapPNG } from "../heatmap/createHeatmap";
import { analyzeImageBufferForPatterns } from "../heatmap/analyseHeatmap";

dotenv.config();

describe("Checkly Slack Message Tests", () => {
  const checkly = new ChecklyClient({});
  const slackClient = new WebClient(process.env.SLACK_AUTH_TOKEN!);
  const channel = process.env.SLACK_BOT_CHANNEL_ID!;

  it.skip("Summarize a single Check Result and send a Slack Notification", async () => {
    const CHECK_ID = "dd89cce7-3eec-4786-8e0e-0e5f3b3647b4";
    const CHECK_RESULT_ID = "aac7e993-2aba-42f8-a655-54f4cdc22473";

    const check = await checkly.getCheck(CHECK_ID);

    const checkResult = await checkly.getCheckResult(check.id, CHECK_RESULT_ID);

    const checkResults = await fetchCheckResults(checkly, {
      checkId: check.id,
      ...last24h(new Date(checkResult.startedAt)),
    });

    console.log("CHECK_RESULTS", checkResults.length);

    const failingCheckResults = checkResults.filter(
      (result) => result.hasFailures || result.hasErrors,
    );

    console.log("CHECK_RESULT_FAILURES", failingCheckResults.length);

    const promptDef = summarizeErrorsPrompt({
      check: check.id,
      locations: check.locations,
      frequency: check.frequency,
      intervalStart: new Date(LAST_30_DAYS.from),
      intervalEnd: new Date(LAST_30_DAYS.to),
      results: [...failingCheckResults, checkResult].map(summarizeCheckResult),
    });
    const { object: errorGroups } =
      await generateObject<SummarizeErrorsPromptType>(promptDef);

    console.log("ERROR_GROUPS", errorGroups);

    const errorGroup = errorGroups.groups.find(
      (g) => g.checkResults.indexOf(checkResult.id) > -1,
    );

    console.log("ERROR_GROUP", errorGroup);

    const heatmapImage = generateHeatmapPNG(checkResults, {
      bucketSizeInMinutes: check.frequency * 10,
      verticalSeries: check.locations.length,
    });
    // Arrange
    const message = {
      text: `*Check Result Details*`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Check Failure Details",
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Check Name:*\n<${checkly.getCheckUrl(check.id)}|${check.name}>`,
            },
            {
              type: "mrkdwn",
              text: `*Timestamp:*\n${new Date(LAST_30_DAYS.from).toISOString()}`,
            },
            {
              type: "mrkdwn",
              text: `*Location:*\n\`${checkResult.runLocation}\``,
            },
            {
              type: "mrkdwn",
              text: `*Check Result:*\n<${checkly.getCheckResultAppUrl(check.id, checkResult.id)}|Link>`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Error Message:*\n\`${errorGroup?.errorMessage}\`\n\n*Similar Failures:*\nThis error occurred \`${errorGroup?.checkResults.length} times\` across locations: \`${check.locations.join("\`, \`")}\`. We saw \`${errorGroups.groups.length} Error Groups\` in total with \`${failingCheckResults.length} failures\` in the same timeframe.`,
          },
        },
      ],
    };

    // console.log("MESSAGE", JSON.stringify(message, null, 2));

    // Act
    const result = await slackClient.chat.postMessage({
      channel,
      ...message,
    });

    const upload = await slackClient.files.uploadV2({
      file: heatmapImage,
      filename: "errorgroup.png",
      title: "Show Error Group Details",
      channel_id: channel,
    });

    // Assert
    expect(result.ok).toBe(true);
    expect(result.message?.text).toBeDefined();
  }, 300000);

  it.skip("Summarize a Check and send a Slack Notification", async () => {
    const CHECK_ID = "dd89cce7-3eec-4786-8e0e-0e5f3b3647b4";

    const check = await checkly.getCheck(CHECK_ID);

    const checkResults = await fetchCheckResults(checkly, {
      checkId: check.id,
      ...last24h(new Date()),
    });

    console.log("CHECK_RESULTS", checkResults.length);
    // console.log("CHECK_RESULTS", JSON.stringify(checkResults, null, 2));

    const failingCheckResults = checkResults.filter(
      (result) => result.hasFailures || result.hasErrors,
    );

    console.log("CHECK_RESULT_FAILURES", failingCheckResults.length);
    // console.log(
    //   "CHECK_RESULT_FAILURES",
    //   JSON.stringify(failingCheckResults, null, 2),
    // );

    const promptDef = summarizeErrorsPrompt({
      check: check.id,
      locations: check.locations,
      frequency: check.frequency,
      intervalStart: new Date(LAST_30_DAYS.from),
      intervalEnd: new Date(LAST_30_DAYS.to),
      results: failingCheckResults.map(summarizeCheckResult),
    });
    const { object: errorGroups } =
      await generateObject<SummarizeErrorsPromptType>(promptDef);

    console.log("ERROR_GROUPS", errorGroups);

    const heatmapImage = generateHeatmapPNG(checkResults, {
      bucketSizeInMinutes: check.frequency * 10,
      verticalSeries: check.locations.length,
    });
    // Arrange
    const message = {
      text: `*Check Details*`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `Check ${check.name} Details`,
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Timestamp:*\n${new Date(LAST_30_DAYS.from).toISOString()}`,
            },
            {
              type: "mrkdwn",
              text: `*Location:*\n\`${check.locations.join(", ")}\``,
            },
            {
              type: "mrkdwn",
              text: `*Check Result:*\n<${checkly.getCheckUrl(check.id)}|Link>`,
            },
          ],
        },
        ...errorGroups.groups.flatMap((group) => [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `*Error Pattern:* ${group.errorMessage}\n` +
                `*Occurrences:* ${group.checkResults.length} failures\n` +
                `*Affected Locations:* ${[
                  ...new Set(
                    group.checkResults.map(
                      (id) =>
                        checkResults.find((r) => r.id === id)?.runLocation,
                    ),
                  ),
                ]
                  .filter(Boolean)
                  .join(", ")}`,
            },
          },
          {
            type: "divider",
          },
        ]),
      ],
    };

    // console.log("MESSAGE", JSON.stringify(message, null, 2));

    // Act
    const result = await slackClient.chat.postMessage({
      channel,
      ...message,
    });

    const upload = await slackClient.files.uploadV2({
      file: heatmapImage,
      filename: "errorgroup.png",
      title: "Show Error Group Details",
      channel_id: channel,
    });

    // Assert
    expect(result.ok).toBe(true);
    expect(result.message?.text).toBeDefined();
  }, 300000);
});
