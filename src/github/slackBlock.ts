export const releaseHeader = {
  type: "section",
  text: {
    type: "mrkdwn",
    text: "*Release Overview*",
  },
};

export const divider = { type: "divider" };

export const createReleaseBlock = function ({
  release,
  releaseUrl,
  diffUrl,
  date,
  repo,
  repoUrl,
  authors,
  summary,
}: {
  release: string;
  releaseUrl: string;
  diffUrl: string;
  date: string;
  repo: string;
  repoUrl: string;
  authors: string[];
  summary: string;
}) {
  return {
    blocks: [
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `:rocket: *Release*\n<${releaseUrl}|${release}> - <${diffUrl}|Diff>`,
          },
          {
            type: "mrkdwn",
            text: `:calendar: *When*\n${date}`,
          },
          {
            type: "mrkdwn",
            text: `:package: *Repo*\n<${repoUrl}|${repo}>`,
          },
          {
            type: "mrkdwn",
            text: `:star: *Authors*\n${authors.join(", ")}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Summary*\n${summary}`,
        },
      },
    ],
  };
};
