import { Check } from "../checkly/models";
import { mapCheckToContextValue } from "../checkly/utils";
import { stringify } from "yaml";

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
): string {
  return `Based on the following releases, which ones are most relevant to the check state change?

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
}

export function generateFindRelevantDeploymentsPrompt(
  check: Check,
  checkResult: string,
  deployments: GithubDeploymentForPrompt[],
): string {
  return `Based on the following deployments, which ones are most relevant to the check state change? Analyze the check script, result and releases to determine which releases are most relevant. Provide a list of deployment ids that are most relevant to the check.

Deployments:
${stringify(deployments)}

Check:
${stringify(mapCheckToContextValue(check))}

Check Script:
${check.script}

Check Result:
${checkResult}`;
}

export function generateReleaseHeadlinePrompt(
  prevRelease: string,
  currentRelease: string,
  diff: string,
): string {
  return `The following diff describes the changes between ${prevRelease} and ${currentRelease}.

Summarize the changes in a single sentence:
${JSON.stringify(diff)}

Do not describe the outer context as the developer is already aware.
Do not yap.
Do not use any formatting rules.`;
}

export function generateReleaseSummaryPrompt(
  prevRelease: string,
  currentRelease: string,
  diff: string,
): string {
  return `The following diff describes the changes between ${prevRelease} and ${currentRelease}.

  Summarize the changes so that another developer quickly understands what has changes:
${diff.slice(0, MAX_DIFF_LENGTH)}.

Do not describe the outer context as the developer is already aware.
Do not yap.
Format titles using *Title*, code using \`code\`.
Do not use any other formatting rules.
Focus on potential impact of the change and the reason for the change.`;
}

export function generateDeploymentSummaryPrompt(
  prevSha: string,
  currentSha: string,
  diff: string,
): string {
  return `The following diff describes the changes between ${prevSha} and ${currentSha}.

  Summarize the changes so that another developer quickly understands what has changes:
  ${diff}

  Do not describe the outer context as the developer is already aware.
  Do not yap. Format titles using *Title*, code using \`code\`. Do not use any other formatting rules.
  Focus on potential impact of the change and the reason for the change.`;
}

export function generateFindRepoPrompt(
  userPrompt: string,
  allRepos: GithubRepoForPrompt[],
): string {
  return `Based on the following prompt: ${userPrompt} and the list of repositories

${JSON.stringify(allRepos)}

  Select the repository that is most relevant to the prompt.`;
}
