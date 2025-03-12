import { CheckSyncStatus } from "../checkly/models";
import postgres from "./postgres";

// We need to keep track of what was synced in a separate table to avoid re-syncing periods where no results are available
// This is especially important for checks with lower frequency, or accounts with maintenance-windows
// This also helps us to avoid re-syncing the same data over and over again
export interface CheckSyncStatusTable extends CheckSyncStatus {}

export const upsertCheckSyncStatus = async (
  input: CheckSyncStatusTable,
): Promise<void> => {
  await postgres<CheckSyncStatus>("check_sync_status")
    .insert(input)
    .onConflict("checkId")
    .merge({
      to: postgres.raw("GREATEST(EXCLUDED.to, check_sync_status.to)"), // Keep the latest `to`
      syncedAt: postgres.fn.now(), // Always update `syncedAt`
    });
};

export const findCheckSyncStatus = async (
  checkId: string,
): Promise<CheckSyncStatusTable | null> => {
  const syncStatus = await postgres<CheckSyncStatus>("check_sync_status")
    .where({ checkId })
    .first();
  return syncStatus || null;
};
