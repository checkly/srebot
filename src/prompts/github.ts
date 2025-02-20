import { stringify } from "yaml";
import { Check } from "../checkly/models";
import { mapCheckToContextValue } from "../checkly/utils";
import {
  definePrompt,
  promptConfig,
  PromptDefinition,
  PromptDefinitionForText,
} from "./common";
import { validObjectList, validObject, validString } from "./validation";
import { z } from "zod";

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
): PromptDefinition {
  validObject.parse(check);
  validString.parse(checkResult);
  validObjectList.parse(releases);

  const prompt = `Based on the following releases, which ones are most relevant to the check state change?

Analyze the check script, result and releases to determine which releases are most relevant.
Provide a list of release ids that are most relevant to the check.

Releases:
${stringify(releases)}

Check:
${stringify(mapCheckToContextValue(check))}

Check Script:
${check.script}

Check Result:
${checkResult}`;

  const schema = z.object({
    releaseIds: z
      .array(z.string())
      .describe(
        "The ids of the releases that are most relevant to the check failure.",
      ),
  });

  return definePrompt("findRelevantReleases", prompt, schema);
}

export function generateFindRelevantDeploymentsPrompt(
  check: Check,
  checkResult: string,
  deployments: GithubDeploymentForPrompt[],
): PromptDefinition {
  validObject.parse(check);
  validString.parse(checkResult);
  validObjectList.parse(deployments);

  const prompt = `Based on the following deployments, which ones are most relevant to the check state change? Analyze the check script, result and releases to determine which releases are most relevant. Provide a list of deployment ids that are most relevant to the check.

Deployments:
${stringify(deployments)}

Check:
${stringify(mapCheckToContextValue(check))}

Check Script:
${check.script}

Check Result:
${checkResult}`;

  const schema = z.object({
    deploymentIds: z
      .array(z.string())
      .describe(
        "The ids of the releases that are most relevant to the check failure.",
      ),
  });

  return definePrompt("findRelevantDeployments", prompt, schema, {
    temperature: 0,
  });
}

export function generateReleaseHeadlinePrompt(
  prevRelease: string,
  currentRelease: string,
  diff: string,
): PromptDefinitionForText {
  validString.parse(prevRelease);
  validString.parse(currentRelease);
  validString.parse(diff);

  const prompt = `The following diff describes the changes between ${prevRelease} and ${currentRelease}.

Summarize the changes in a single sentence:
${diff}

Do not describe the outer context as the developer is already aware.
Do not yap.
Do not use any formatting rules.`;

  return {
    prompt,
    ...promptConfig("releaseHeadline"),
  };
}

export interface Commit {
  author: string;
  sha: string;
  message: string;
}

export interface Release {
  commits: Commit[];
}

export function generateReleaseSummaryPrompt(
  prevRelease: string,
  currentRelease: string,
  release: Release,
): PromptDefinitionForText {
  validObject.parse(release);
  validObjectList.parse(release.commits);

  const releaseString = JSON.stringify(release);
  validString.parse(prevRelease);
  validString.parse(currentRelease);
  validString.parse(releaseString);

  const prompt = `The following diff describes the changes between ${prevRelease} and ${currentRelease}.

  Summarize the changes so that another developer quickly understands what has changes:
${releaseString.slice(0, MAX_DIFF_LENGTH)}.

Make sure the commit hash, the authors and the summary of each commit is present.
Stick to the facts presented without additional assumptions.

Do not describe the outer context as the developer is already aware.
Do not yap.
Format titles using *Title*, code using \`code\`.
Do not use any other formatting rules.
Focus on potential impact of the change and the reason for the change.`;

  return {
    prompt,
    ...promptConfig("releaseSummary"),
  };
}

export function generateDeploymentSummaryPrompt(
  prevSha: string,
  currentSha: string,
  diff: string,
): PromptDefinitionForText {
  validString.parse(prevSha);
  validString.parse(currentSha);
  validString.parse(diff);

  const prompt = `The following diff describes the changes between ${prevSha} and ${currentSha}.

  Summarize the changes so that another developer quickly understands what has changes:
  ${diff}

  Do not describe the outer context as the developer is already aware.
  Do not yap. Format titles using *Title*, code using \`code\`. Do not use any other formatting rules.
  Focus on potential impact of the change and the reason for the change.`;

  return {
    prompt,
    ...promptConfig("deploymentSummary"),
  };
}

export function generateFindRepoPrompt(
  userPrompt: string,
  allRepos: GithubRepoForPrompt[],
): PromptDefinition {
  validString.parse(userPrompt);
  validObjectList.parse(allRepos);

  const prompt = `Based on the following prompt: ${userPrompt} and the list of repositories

${JSON.stringify(allRepos)}

Select the repository that is most relevant to the prompt.`;

  const schema = z.object({
    repo: z.enum(allRepos.map((r) => r.name) as [string, ...string[]]),
  });

  return definePrompt("findRepo", prompt, schema);
}

export function generateTimeframePrompt(): PromptDefinitionForText {
  const system = `A developer describes a task which is about a certain time frame.
    Based on his prompt choose identify the date in ISO8601 format.
  If you cannot find a timeframe return the date from 24h ago. Today is ${new Date().toISOString()}. Do not yap.`;

  return {
    prompt: "",
    system,
    ...promptConfig("timeframe"),
  };
}
