import { checkly } from "../checkly/client";
import { Check } from "../checkly/models";
import postgres from "./postgres";

export interface CheckTable {
  id: string;
  accountId: string;
  checkType: string;
  name: string;
  frequency: number | null;
  frequencyOffset: number | null;
  activated: boolean;
  muted: boolean;
  shouldFail: boolean;
  locations: string[] | null;
  script: string | null;
  created_at: Date;
  updated_at: Date;
  doubleCheck: boolean;
  tags: string[];
  sslCheckDomain: string | null;
  setupSnippetId: number | null;
  tearDownSnippetId: number | null;
  localSetupScript: string | null;
  localTearDownScript: string | null;
  alertSettings: any;
  useGlobalAlertSettings: boolean;
  degradedResponseTime: number | null;
  maxResponseTime: number | null;
  groupId: number | null;
  groupOrder: number;
  heartbeat: string | null;
  runtimeId: string | null;
  scriptPath: string | null;
  retryStrategy: any;
  request: any;
  runParallel: boolean;
  alertChannelSubscriptions: any[];
  privateLocations: string[];
  dependencies: any[];
  environmentVariables: any[];
  fetchedAt: Date | null;
}

export async function insertChecks(checks: (Check & { fetchedAt: Date })[]) {
  const serializedChecks = checks.map((check) => ({
    id: check.id,
    accountId: checkly.accountId,
    groupId: check.groupId,
    checkType: check.checkType,
    name: check.name,
    activated: check.activated,
    muted: check.muted,
    script: check.script,
    dependencies: JSON.stringify(check.dependencies || []),
    degradedResponseTime: check.degradedResponseTime,
    maxResponseTime: check.maxResponseTime,
    scriptPath: check.scriptPath,
    doubleCheck: check.doubleCheck,
    runParallel: check.runParallel,
    useGlobalAlertSettings: check.useGlobalAlertSettings,
    alertChannelSubscriptions: JSON.stringify(
      check.alertChannelSubscriptions || [],
    ),
    request: JSON.stringify(check.request || {}),
    alertSettings: JSON.stringify(check.alertSettings || {}),
    environmentVariables: JSON.stringify(check.environmentVariables || []),
    retryStrategy: JSON.stringify(check.retryStrategy || {}),
    locations: check.locations || [],
    privateLocations: check.privateLocations || [],
    tags: check.tags || [],
    runtimeId: check.runtimeId,
    setupSnippetId: check.setupSnippetId,
    tearDownSnippetId: check.tearDownSnippetId,
    localSetupScript: check.localSetupScript,
    localTearDownScript: check.localTearDownScript,
    fetchedAt: check.fetchedAt,
    frequency: check.frequency,
    frequencyOffset: check.frequencyOffset,
    created_at: check.created_at,
    updated_at: check.updated_at,
  }));

  await postgres("checks").insert(serializedChecks).onConflict("id").merge();
}

export async function readCheck(id: string) {
  const check = await postgres<CheckTable>("checks").where({ id }).first();
  if (!check) {
    throw new Error(`Check with id ${id} not found`);
  }
  return check;
}

export async function readChecks(ids: string[]): Promise<CheckTable[]> {
  return postgres<CheckTable>("checks").whereIn("id", ids);
}

export async function readChecksByAccountId(
  accountId: string,
): Promise<CheckTable[]> {
  return postgres<CheckTable>("checks").where({ accountId });
}

type CheckWithGroupName = CheckTable & { groupName: string };

export async function readChecksWithGroupNames(
  ids: string[],
): Promise<CheckWithGroupName[]> {
  const checks = await postgres<CheckWithGroupName>("checks")
    .whereIn("checks.id", ids)
    .leftJoin("check_groups", "checks.groupId", "check_groups.id")
    .select("checks.*", "check_groups.name as groupName");

  return checks;
}

export const removeAccountChecks = async (
  checkIdsToKeep: string[],
  accountId: string,
) => {
  await postgres("checks")
    .delete()
    .whereNotIn("id", checkIdsToKeep)
    .where("accountId", accountId);
};
