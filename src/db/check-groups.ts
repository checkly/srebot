import { CheckGroup } from "../checkly/models";
import { checkly } from "../checkly/client";
import postgres from "./postgres";

interface CheckGroupTable {
  id: bigint;
  name: string;
  concurrency: number;
  accountId: string;
  apiCheckDefaults: any;
  alertSettings: any;
  environmentVariables: any[];
  setupSnippetId: number | null;
  tearDownSnippetId: number | null;
  localSetupScript: string | null;
  localTearDownScript: string | null;
  activated: boolean;
  muted: boolean;
  useGlobalAlertSettings: boolean;
  doubleCheck: boolean;
  locations: string[];
  tags: string[];
  created_at: Date;
  updated_at: Date;
  runtimeId: string | null;
  retryStrategy: any;
  runParallel: boolean;
  alertChannelSubscriptions: any[];
  privateLocations: string[];
  fetchedAt: Date | null;
}

export async function readCheckGroup(id: bigint) {
  const group = await postgres<CheckGroupTable>("check_groups")
    .where({ id })
    .first();
  if (!group) {
    throw new Error(`Check group with id ${id} not found`);
  }
  return group;
}

export async function insertCheckGroups(groups: CheckGroup[]) {
  const serializedGroups = groups.map((group) => ({
    id: group.id,
    accountId: checkly.accountId,
    name: group.name,
    activated: group.activated,
    muted: group.muted,
    tags: group.tags || [],
    locations: group.locations || [],
    environmentVariables: JSON.stringify(group.environmentVariables || []),
    alertChannelSubscriptions: JSON.stringify(
      group.alertChannelSubscriptions || [],
    ),
    alertSettings: JSON.stringify(group.alertSettings || {}),
    useGlobalAlertSettings: group.useGlobalAlertSettings,
    doubleCheck: group.doubleCheck,
    runtimeId: group.runtimeId,
    apiCheckDefaults: JSON.stringify(group.apiCheckDefaults || {}),
    concurrency: group.concurrency,
    setupSnippetId: group.setupSnippetId,
    tearDownSnippetId: group.tearDownSnippetId,
    localSetupScript: group.localSetupScript,
    localTearDownScript: group.localTearDownScript,
    privateLocations: group.privateLocations || [],
  }));

  await postgres("check_groups")
    .insert(serializedGroups)
    .onConflict("id")
    .merge();
}

export const removeAccountCheckGroups = async (
  groupIdsToKeep: number[],
  accountId: string,
): Promise<void> => {
  await postgres("check_groups")
    .delete()
    .whereNotIn("id", groupIdsToKeep)
    .where("accountId", accountId);
};
