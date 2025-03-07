import { checkly } from "../../checkly/client";
import { keyBy } from "lodash";
import { Check, CheckGroup } from "../../checkly/models";

const parseAsGroupId = (str: string): number | null => {
  return /^\d+$/i.test(str) && !Number.isNaN(parseInt(str))
    ? parseInt(str)
    : null;
};

const applyGroupSettings = (
  checks: Check[],
  groupsById: Record<number, CheckGroup>,
): Check[] => {
  return checks.map((check: Check) => {
    const checkGroup = check.groupId ? groupsById[check.groupId] : null;
    if (!checkGroup) {
      return check;
    }
    const checkTags = new Set([...check.tags, ...checkGroup.tags]);
    return {
      ...check,
      tags: Array.from(checkTags),
      locations: checkGroup.locations,
      group: checkGroup,
    };
  });
};

const filterTargetCheck = (
  arg: string | undefined,
  checks: Check[],
  groupsById: Record<number, CheckGroup>,
): Check[] => {
  const shouldTargetAllChecks = !arg;
  if (shouldTargetAllChecks) {
    return checks;
  }
  const groupId = parseAsGroupId(arg);
  const shouldTargetCheckByGroup = groupId && groupsById[groupId];
  if (shouldTargetCheckByGroup) {
    return checks.filter((check) => check.groupId === groupId);
  }

  const tag = arg;
  return checks.filter((check) => check.tags.includes(tag));
};

const enrichChecks = async (
  checks: Check[],
  groupsById: Record<number, CheckGroup>,
): Promise<Check[]> => {
  const checksWithDependencies = await Promise.all(
    checks.map((check) =>
      checkly.getCheck(check.id, { includeDependencies: true }),
    ),
  );

  // Apply group settings again
  return applyGroupSettings(checksWithDependencies, groupsById);
};

export const findTargetChecks = async (arg?: string): Promise<Check[]> => {
  const checksWithoutGroupSettings = await checkly.getChecks();
  // TODO adapt this to work with more check types
  const filteredChecksWithoutGroupSettings = checksWithoutGroupSettings.filter(
    (check) => ["BROWSER", "API", "MULTISTEP"].includes(check.checkType),
  );
  const allGroups = await checkly.getCheckGroups();
  const groupsById: Record<number, CheckGroup> = keyBy(allGroups, "id");
  const checks = applyGroupSettings(
    filteredChecksWithoutGroupSettings,
    groupsById,
  );

  const filteredChecks = filterTargetCheck(arg, checks, groupsById);

  return enrichChecks(filteredChecks, groupsById);
};
