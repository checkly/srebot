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

export async function insertChecks(checks: Check[]) {
  const serializedChecks = checks.map((check) => ({
    id: check.id,
    accountId: checkly.accountId,
    checkType: check.checkType,
    name: check.name,
    activated: check.activated,
    muted: check.muted,
    doubleCheck: check.doubleCheck,
    runParallel: check.runParallel,
    useGlobalAlertSettings: check.useGlobalAlertSettings,
    alertChannelSubscriptions: JSON.stringify(
      check.alertChannelSubscriptions || [],
    ),
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
