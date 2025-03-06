import { CheckGroup } from "../checkly/models";
import { checkly } from "../checkly/client";
import postgres from "./postgres";

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
