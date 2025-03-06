import { checkly } from "../checkly/client";
import { Check } from "../checkly/models";
import postgres from "./postgres";

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
