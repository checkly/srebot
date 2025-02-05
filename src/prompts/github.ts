const MAX_DIFF_LENGTH = 1000000;

export interface GithubRepoForPrompt {
  name: string;
  description: string | null;
  link: string;
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
