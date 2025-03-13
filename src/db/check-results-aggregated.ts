import postgres from "./postgres";

export interface CheckResultsAggregatedTable {
  accountId: string; // UUID of the account
  checkId: string; // UUID of the check
  location: string; // The location of the check
  startedAtBucket: Date; // Timestamp for the start of the aggregation bucket
  passingFinal: number; // Final count of passing results
  failingFinal: number; // Final count of failing results
  degradedFinal: number; // Final count of degraded results
  allFinal: number; // Final total count of results
  failingAttempt: number; // Count of failing attempts
  degradedAttempt: number; // Count of degraded attempts
  allAttempt: number; // Total count of attempts
}

export const bulkUpsertCheckResultsAggregated = async (
  input: CheckResultsAggregatedTable[],
): Promise<void> => {
  if (input.length === 0) return;

  await postgres<CheckResultsAggregatedTable>("check_results_aggregated")
    .insert(input)
    .onConflict(["checkId", "startedAtBucket", "location"])
    .merge({
      passingFinal: postgres.raw(
        `"check_results_aggregated"."passingFinal" + EXCLUDED."passingFinal"`,
      ),
      failingFinal: postgres.raw(
        `"check_results_aggregated"."failingFinal" + EXCLUDED."failingFinal"`,
      ),
      degradedFinal: postgres.raw(
        `"check_results_aggregated"."degradedFinal" + EXCLUDED."degradedFinal"`,
      ),
      allFinal: postgres.raw(
        `"check_results_aggregated"."allFinal" + EXCLUDED."allFinal"`,
      ),
      failingAttempt: postgres.raw(
        `"check_results_aggregated"."failingAttempt" + EXCLUDED."failingAttempt"`,
      ),
      degradedAttempt: postgres.raw(
        `"check_results_aggregated"."degradedAttempt" + EXCLUDED."degradedAttempt"`,
      ),
      allAttempt: postgres.raw(
        `"check_results_aggregated"."allAttempt" + EXCLUDED."allAttempt"`,
      ),
    });
};
