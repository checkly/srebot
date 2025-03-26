import { keyBy, uniqBy } from "lodash";
import { CheckTable, readChecks } from "./check";
import { CheckGroupTable, readCheckGroups } from "./check-groups";

export type CheckTableMerged = CheckTable & {
  group?: CheckGroupTable;
};

export const checksMerged = async (
  checkIds: string[],
): Promise<Record<string, CheckTableMerged>> => {
  const checks = await readChecks(checkIds);
  const groupIds = [
    ...new Set(checks.map((check) => check.groupId).filter(Boolean)),
  ];
  if (groupIds.length === 0) {
    return keyBy(checks, "id");
  }

  const groupsById = keyBy(await readCheckGroups(groupIds as number[]), "id");

  const result: Record<string, CheckTableMerged> = {};
  checks.forEach((check) => {
    if (!check.groupId) {
      result[check.id] = check;
      return;
    }
    const group = groupsById[check.groupId];
    const tags = [...new Set(check.tags || group.tags)];
    const activated = check.activated && group.activated;
    const muted = check.muted || group.muted;
    const environmentVariables = uniqBy(
      [...group.environmentVariables, ...check.environmentVariables],
      "key",
    );

    result[check.id] = {
      ...check,
      group,
      tags,
      activated,
      muted,
      environmentVariables,
      locations: group.locations,
    };
  });

  return result;
};

export const readCheckMerged = async (
  checkId: string,
): Promise<CheckTableMerged> => {
  const checks = await checksMerged([checkId]);
  return checks[checkId];
};
