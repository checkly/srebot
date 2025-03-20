import { initConfig } from "../lib/init-config";
import * as fs from "fs";
import { join } from "path";
import { CoreSystemMessage, CoreUserMessage, generateObject } from "ai";
import { defineMessagesPrompt } from "./common";
import { z } from "zod";
import { Factuality, Score } from "autoevals";
import { openai } from "@ai-sdk/openai";

initConfig();

// Define an enum for error categories.
enum ErrorCategory {
  PASSING = "PASSING",
  FLAKY = "FLAKY",
  FAILING = "FAILING",
}

// Interface for prompt configuration arguments.
interface GeneratePromptConfigArgs {
  systemPrompt: string;
  userPrompt: string;
  categoryDescription: string;
  failureIncidentsSummaryDescription: string;
  temperature: number;
  maxTokens: number;
}

// Type for test case data.
interface TestCase {
  heatmapPath: string;
  expectedCategory: ErrorCategory;
  input: string;
  expectedSummary: string;
}

// Interface for history records.
interface HistoryRecord {
  iteration: number;
  promptConfig: GeneratePromptConfigArgs;
  overallScore: number;
  feedbackList: string[];
  bestFeedback: string;
}

// Generate a prompt configuration for a given heatmap image buffer and configuration args.
const generatePromptConfig = (
  heatmapBuffer: Buffer,
  args: GeneratePromptConfigArgs,
) => {
  const messages = [
    {
      role: "system",
      content: args.systemPrompt,
    } as CoreSystemMessage,
    {
      role: "user",
      content: [
        { type: "text", text: args.userPrompt },
        {
          type: "image",
          image: `data:image/jpeg;base64,${heatmapBuffer.toString("base64")}`,
        },
      ],
    } as CoreUserMessage,
  ];

  const schema = z.object({
    category: z.nativeEnum(ErrorCategory).describe(args.categoryDescription),
    failureIncidentsSummary: z
      .string()
      .describe(args.failureIncidentsSummaryDescription),
  });

  return defineMessagesPrompt("analyseCheckFailureHeatMap", messages, schema, {
    temperature: args.temperature,
    maxTokens: args.maxTokens,
  });
};

// Define test cases.
const testCases: TestCase[] = [
  {
    heatmapPath: join(
      __dirname,
      "checkly.eval.spec.fixtures",
      "heatmaps",
      "heatmap-001.png",
    ),
    expectedCategory: ErrorCategory.FLAKY,
    input:
      "Where and when did the failures occur in the last 24 hours? The image shows a heatmap of a check running in us-east-1 and eu-west-1.",
    expectedSummary:
      "Failures affect both (us-east-1, and eu-west-1) at random intervals throughout the last 24h.",
  },
  {
    heatmapPath: join(
      __dirname,
      "checkly.eval.spec.fixtures",
      "heatmaps",
      "heatmap-002.png",
    ),
    expectedCategory: ErrorCategory.FAILING,
    input:
      "Where and when did the failures occur in the last 24 hours? The input is a heatmap image of a check running in eu-west-1 and eu-central-1.",
    expectedSummary:
      "Failures affected both location (eu-west-1) and (eu-central-1). There were two periods of failures, one early in the night around 3 and one in the afternoon until now (ongoing)",
  },
  {
    heatmapPath: join(
      __dirname,
      "checkly.eval.spec.fixtures",
      "heatmaps",
      "heatmap-003.png",
    ),
    expectedCategory: ErrorCategory.PASSING,
    input:
      "Where and when did the failures occur in the last 24 hours? The input is a heatmap image of a check running every 12h in (eu-west-1) and (us-east-1)",
    expectedSummary:
      "No failures in both location (eu-west-1) and (us-east-1) in the last 24 hours.",
  },
  {
    heatmapPath: join(
      __dirname,
      "checkly.eval.spec.fixtures",
      "heatmaps",
      "heatmap-004.png",
    ),
    expectedCategory: ErrorCategory.FAILING,
    input:
      "Where and when did the failures occur in the last 24 hours? The input is a heatmap image of a check failing all the time (eu-south-1) and (eu-central-1)",
    expectedSummary:
      "Failures are happening in both location (eu-south-1) and (eu-central-1) all the time",
  },
];

// Score an individual test case with detailed feedback.
// Returns `categoryMatches` instead of `passed`.
const scoreTestCase = async (
  testCase: TestCase,
  config: GeneratePromptConfigArgs,
): Promise<{
  categoryMatches: boolean;
  feedback: string;
  factuality: number;
  response: any;
}> => {
  const heatmapBuffer: Buffer = fs.readFileSync(testCase.heatmapPath);
  const promptConfig = generatePromptConfig(heatmapBuffer, {
    ...config,
    userPrompt: testCase.input,
  });

  const response = await generateObject(promptConfig);
  const factualityResult: Score = await Factuality({
    input: testCase.input,
    output: response.object.failureIncidentsSummary,
    expected: testCase.expectedSummary,
  });

  const categoryMatches: boolean =
    response.object.category === testCase.expectedCategory;
  const rawRationale: string =
    factualityResult.metadata?.rationale?.toString() || "";
  const cleanedRationale = rawRationale
    .replace(/^\s*\d+\.\s*/gm, "")
    .replace(/\n/g, " ");

  const feedbackMessage: string = `Test case [${testCase.heatmapPath.split("/").pop()}]:
Expected Category: ${testCase.expectedCategory}
Actual Category: ${response.object.category}
Expected Summary: ${testCase.expectedSummary}
Actual Summary: ${response.object.failureIncidentsSummary}
Factuality Rationale: ${cleanedRationale}`;

  return {
    categoryMatches,
    feedback: feedbackMessage,
    factuality: factualityResult.score!,
    response,
  };
};

// Score all test cases and aggregate overall score and feedback.
// For each test case, run 10 inner iterations; stop on first failure.
// If all iterations pass, use the lowest factuality score among them.
const scorePrompt = async (
  config: GeneratePromptConfigArgs,
  innerIterations = 10,
): Promise<{
  overallScore: number;
  feedbackList: string[];
}> => {
  let totalScore = 0;
  const feedbackList: string[] = [];

  for (const [index, testCase] of testCases.entries()) {
    let lowestScore = Infinity;
    let feedbackForTestCase = "";

    for (let i = 0; i < innerIterations; i++) {
      const result = await scoreTestCase(testCase, config);
      if (!result.categoryMatches) {
        lowestScore = 0;
        feedbackForTestCase = result.feedback;
        console.log(
          `msg="Category mismatch" test_case=${index + 1} iteration=${i + 1} score=0`,
        );
        break;
      }
      if (result.factuality < lowestScore) {
        lowestScore = result.factuality;
        feedbackForTestCase = result.feedback;
      }
      console.log(
        `msg="Iteration score" test_case=${index + 1} iteration=${i + 1} score=${result.factuality.toFixed(3)}`,
      );
    }

    totalScore += lowestScore;
    feedbackList.push(feedbackForTestCase);
  }

  const overallScore = totalScore / testCases.length;
  console.log(
    `msg="Calculated overall score" overall_score=${overallScore.toFixed(3)} `,
  );
  return { overallScore, feedbackList };
};

// Write complete history to a JSON file.
const writeHistoryToFile = (history: HistoryRecord[]) => {
  const filename = "iteration_history.json";
  fs.writeFileSync(filename, JSON.stringify(history, null, 2));
  console.log(`msg="Wrote complete history to file" filename=${filename}`);
};

// Feed aggregated test case data, literal best prompt, and best prompt feedback to o1 to generate a new prompt configuration.
// Note: The model performing the actual prompt will be 4o.
const generateNewPrompt = async (
  currentConfig: GeneratePromptConfigArgs,
  feedbackList: string[],
  bestHistory: HistoryRecord[],
): Promise<GeneratePromptConfigArgs> => {
  console.log(`msg="Generating new prompt configuration"`);

  const bestRecord = bestHistory[0]; // We pass the best record (only one)
  const messages: (CoreSystemMessage | CoreUserMessage)[] = [
    {
      role: "system",
      content: `You are an AI tasked with refining a prompt configuration for heatmap analysis. The model performing the actual prompt is 4o.`,
    } as CoreSystemMessage,
    {
      role: "user",
      content: `Best Prompt Config:
${JSON.stringify(bestRecord.promptConfig, null, 2)}

Best Prompt Feedback:
${bestRecord.feedbackList.join("\n")}

Current Prompt Config:
${JSON.stringify(currentConfig, null, 2)}

Current Prompt Feedback:
${feedbackList.join("\n")}

Please generate a new prompt configuration with improved chances of achieving a perfect score.`,
    } as CoreUserMessage,
    {
      role: "user",
      content: testCases.map((testCase) => {
        const buffer = fs.readFileSync(testCase.heatmapPath);
        return {
          type: "image",
          image: `data:image/jpeg;base64,${buffer.toString("base64")}`,
          metadata: {
            title: testCase.heatmapPath.split("/").pop(),
          },
        };
      }),
    } as CoreUserMessage,
  ];

  const schema = z.object({
    systemPrompt: z
      .string()
      .describe("The system prompt for the configuration"),
    userPrompt: z.string().describe("The user prompt for the configuration"),
    categoryDescription: z
      .string()
      .describe("Description used for the expected output for category"),
    failureIncidentsSummaryDescription: z
      .string()
      .describe("Description used for the failure summary output"),
    temperature: z.number().describe("The temperature for the prompt"),
    maxTokens: z.number().describe("The max tokens for the prompt"),
  });

  const o1Model = openai("o1");
  const promptForO1 = { messages, model: o1Model, schema };
  const object = await generateObject(promptForO1);
  return object.object;
};

// Main flywheel loop: iteratively score, record complete history, and refine the prompt configuration.
// Only the best prompt (with its literal feedback) is passed for refinement.
const runFlywheel = async (maxIterations = 10): Promise<void> => {
  let currentConfig: GeneratePromptConfigArgs = {
    systemPrompt: `You are an AI that analyzes 24-hour heatmap visualizations of check failures in multiple regions. Your task is to classify the check status as PASSING, FLAKY, or FAILING and to provide a concise, factual summary of any failures. Please follow these guidelines to avoid mistakes seen in past analyses:
1. Categories:
   - PASSING: No failures (0% or fully green) in all regions for the entire 24-hour period.
   - FLAKY: Failures appear in one or more regions, but they clear to 0% (green) before the 24-hour period ends.
   - FAILING: Failures in one or more regions form extended blocks or remain above 0% at the final timestamp.
2. Observing Failures:
   - Indicate only what you can discern from the heatmap. If any region shows non-zero failure percentage, it has failures.
   - If a region is continuously above 0% and never recovers, it is FAILING.
   - If a region’s failures disappear before the end, it is considered resolved.
3. Timing and Descriptions:
   - When the heatmap clearly shows times for failures, approximate start and end times based on the x-axis labeling.
   - If the exact timing is ambiguous, state that failures occur intermittently or randomly.
   - Do not assert failures are random if distinct blocks are visible.
   - If a region is fully green throughout, do not claim failures.
4. Summaries:
   - Provide a succinct, factual summary listing affected regions and approximate failure intervals.
   - If no failures are visible, state that the check is passing.`,
    userPrompt: `Examine the 24-hour heatmap for multiple regions and determine if the check is PASSING, FLAKY, or FAILING. Then, provide a concise summary specifying which regions encountered failures, the approximate timing of those failures, and whether they recovered.`,
    categoryDescription: `Must be exactly one of ["PASSING", "FLAKY", "FAILING"]. Choose PASSING if there is no sign of failure (0%) in any region; FLAKY if failures appear intermittently and resolve; FAILING if failures persist or form extended blocks.`,
    failureIncidentsSummaryDescription: `List regions that fail, stating when failures begin and end (if clear). If timing is ambiguous or random-like, reflect that without inventing details. If a region is failing at the end, note it is ongoing. If no failures exist in any region, say the check is passing.`,
    temperature: 0.2,
    maxTokens: 350,
  };

  let bestRecord: HistoryRecord | null = null;
  const history: HistoryRecord[] = [];
  let iteration = 0;
  let scoreResult: { overallScore: number; feedbackList: string[] };

  do {
    console.log(`iteration=${iteration + 1} msg="Starting iteration"`);
    scoreResult = await scorePrompt(currentConfig, 5);
    console.log(
      `iteration=${iteration + 1} overall_score=${scoreResult.overallScore.toFixed(3)} msg="Iteration overall score"`,
    );

    const newRecord: HistoryRecord = {
      iteration: iteration + 1,
      promptConfig: currentConfig,
      overallScore: scoreResult.overallScore,
      feedbackList: scoreResult.feedbackList,
      bestFeedback: scoreResult.feedbackList[0],
    };

    if (!bestRecord || newRecord.overallScore > bestRecord.overallScore) {
      bestRecord = newRecord;
    }

    // Append the new record to complete history.
    history.push(newRecord);
    writeHistoryToFile(history);

    if (scoreResult.overallScore === 1) {
      console.log(
        `iteration=${iteration + 1} msg="Final configuration achieved" config=${JSON.stringify(currentConfig, null, 2)}`,
      );
      break;
    } else {
      currentConfig = await generateNewPrompt(
        currentConfig,
        scoreResult.feedbackList,
        bestRecord ? [bestRecord] : [],
      );
    }
    iteration++;
  } while (iteration < maxIterations);

  if (iteration === maxIterations) {
    console.log(
      `iteration=${iteration} msg="Max iterations reached. Final configuration" config=${JSON.stringify(currentConfig, null, 2)}`,
    );
  }

  console.log(
    `msg="Final complete history" history=${JSON.stringify(history, null, 2)}`,
  );
};

runFlywheel();
