import { stringify } from "yaml";
import { Check } from "../checkly/models";
import { mapCheckToContextValue } from "../checkly/utils";
import { PromptConfig, promptConfig } from "./common";

const MAX_DIFF_LENGTH = 1000000;

export interface GithubRepoForPrompt {
  name: string;
  description: string | null;
  link: string;
}

export interface GithubReleaseForPrompt {
  id: string;
  repo: string;
  release: string;
  summary: string;
}

export interface GithubDeploymentForPrompt {
  id: string;
  repo: string;
  createdAt: Date;
  summary: string;
}

export function generateFindRelevantReleasesPrompt(
  check: Check,
  checkResult: string,
  releases: GithubReleaseForPrompt[],
): [string, PromptConfig] {
  return [
    `Based on the following releases, which ones are most relevant to the check state change?

Analyze the check script, result and releases to determine which releases are most relevant.
Provide a list of release ids that are most relevant to the check.

Releases:
${stringify(releases)}

Check:
${stringify(mapCheckToContextValue(check))}

Check Script:
${check.script}

Check Result:
${checkResult}`,
    promptConfig({
      experimental_telemetry: {
        isEnabled: true,
        functionId: "findRelevantReleases",
      },
    }),
  ];
}

export function generateFindRelevantDeploymentsPrompt(
  check: Check,
  checkResult: string,
  deployments: GithubDeploymentForPrompt[],
): [string, PromptConfig] {
  return [
    `Based on the following deployments, which ones are most relevant to the check state change? Analyze the check script, result and releases to determine which releases are most relevant. Provide a list of deployment ids that are most relevant to the check.

Deployments:
${stringify(deployments)}

Check:
${stringify(mapCheckToContextValue(check))}

Check Script:
${check.script}

Check Result:
${checkResult}`,
    promptConfig({
      experimental_telemetry: {
        isEnabled: true,
        functionId: "findRelevantDeployments",
      },
    }),
  ];
}

export function generateReleaseHeadlinePrompt(
  prevRelease: string,
  currentRelease: string,
  diff: string,
): [string, PromptConfig] {
  return [
    `The following diff describes the changes between ${prevRelease} and ${currentRelease}.

Summarize the changes in a single sentence:
${diff}

Do not describe the outer context as the developer is already aware.
Do not yap.
Do not use any formatting rules.`,
    promptConfig({
      experimental_telemetry: {
        isEnabled: true,
        functionId: "releaseHeadline",
      },
    }),
  ];
}

export function generateReleaseSummaryPrompt(
  prevRelease: string,
  currentRelease: string,
  diff: string,
): [string, PromptConfig] {
  return [
    `The following diff describes the changes between ${prevRelease} and ${currentRelease}.

  Summarize the changes so that another developer quickly understands what has changes:
${diff.slice(0, MAX_DIFF_LENGTH)}.

Do not describe the outer context as the developer is already aware.
Do not yap.
Format titles using *Title*, code using \`code\`.
Do not use any other formatting rules.
Focus on potential impact of the change and the reason for the change.`,
    promptConfig({
      experimental_telemetry: {
        isEnabled: true,
        functionId: "releaseSummary",
      },
    }),
  ];
}

export function generateDeploymentSummaryPrompt(
  prevSha: string,
  currentSha: string,
  diff: string,
): [string, PromptConfig] {
  return [
    `The following diff describes the changes between ${prevSha} and ${currentSha}.

  Summarize the changes so that another developer quickly understands what has changes:
  ${diff}

  Do not describe the outer context as the developer is already aware.
  Do not yap. Format titles using *Title*, code using \`code\`. Do not use any other formatting rules.
  Focus on potential impact of the change and the reason for the change.`,
    promptConfig({
      experimental_telemetry: {
        isEnabled: true,
        functionId: "deploymentSummary",
      },
    }),
  ];
}

export function generateFindRepoPrompt(
  userPrompt: string,
  allRepos: GithubRepoForPrompt[],
): [string, PromptConfig] {
  return [
    `Based on the following prompt: ${userPrompt} and the list of repositories

${JSON.stringify(allRepos)}

Select the repository that is most relevant to the prompt.`,
    promptConfig({
      experimental_telemetry: {
        isEnabled: true,
        functionId: "findRepo",
      },
    }),
  ];
}

export function generateTimeframePrompt(): [string, PromptConfig] {
  return [
    `A developer describes a task which is about a certain time frame.
    Based on his prompt choose identify the date in ISO8601 format.
    If you cannot find a timeframe return the date from 24h ago. Today is ${new Date().toISOString()}. Do not yap.`,
    promptConfig({
      experimental_telemetry: {
        isEnabled: true,
        functionId: "timeframe",
      },
    }),
  ];
}
