import postgres from "./postgres";
import { CheckResult } from "../checkly/models";
import { checkly } from "../checkly/client";

export interface CheckResultTable {
  id: string;
  checkId: string;
  accountId: string;
  checkRunId: number;
  name: string;
  hasErrors: boolean;
  hasFailures: boolean;
  runLocation: string;
  startedAt: Date;
  stoppedAt: Date;
  responseTime: number;
  attempts: number;
  isDegraded: boolean;
  overMaxResponseTime: boolean;
  sequenceId: string;
  resultType: string;
  multiStepCheckResult: any;
  apiCheckResult: any;
  browserCheckResult: any;
  created_at: Date;
  fetchedAt: Date | null;
}

export async function findCheckResults(
  checkIds: string | string[],
  from: Date,
  to: Date,
): Promise<CheckResultTable[]> {
  return postgres<CheckResultTable>("check_results")
    .whereIn("checkId", Array.isArray(checkIds) ? checkIds : [checkIds])
    .where("startedAt", ">=", from.toISOString())
    .where("startedAt", "<=", to.toISOString())
    .orderBy("startedAt", "asc");
}

export type CheckResultAggregate = {
  checkId: string;
  runLocation: string;
  count: number;
  passingCount: number;
  errorCount: number;
  degradedCount: number;
  startedAtBin: Date;
};

export async function findCheckResultsAggregated(
  query: {
    from: Date;
    to: Date;
  } & (
    | { accountId: string }
    | { checkId: string }
    | { accountId: string; checkId: string }
  ),
  intervalMinutes: number = 30,
): Promise<CheckResultAggregate[]> {
  return postgres("check_results")
    .select(
      "checkId",
      "runLocation",
      postgres.raw('count(*)::integer as "count"'),
      postgres.raw(
        'count(*) filter (where "hasErrors" = false and "hasFailures" = false and "isDegraded" = false)::integer as "passingCount"',
      ),
      postgres.raw(
        'count(*) filter (where "hasErrors" = true or "hasFailures" = true)::integer as "errorCount"',
      ),
      postgres.raw(
        'count(*) filter (where "isDegraded" = true)::integer as "degradedCount"',
      ),
      postgres.raw(
        `date_bin('${intervalMinutes} minutes', "startedAt", timestamp '2000-01-01') as "startedAtBin"`,
      ),
    )
    .modify((queryBuilder) => {
      if ("checkId" in query) {
        queryBuilder.where("checkId", query.checkId);
      }
      if ("accountId" in query) {
        queryBuilder.where("accountId", query.accountId);
      }
    })
    .whereBetween("startedAt", [query.from, query.to])
    .andWhere("resultType", "FINAL")
    .groupBy(
      "checkId",
      "runLocation",
      postgres.raw(
        `date_bin('${intervalMinutes} minutes', "startedAt", timestamp '2000-01-01')`,
      ),
    )
    .orderBy("startedAtBin", "asc");
}

export async function findCheckResultsByAccountId(
  accountId: string,
  from: Date,
  to: Date,
): Promise<CheckResultTable[]> {
  const results = await postgres<CheckResultTable>("check_results")
    .where("accountId", accountId)
    .where("startedAt", ">=", from.toISOString())
    .where("startedAt", "<=", to.toISOString())
    .orderBy("startedAt", "desc");

  return results;
}

export const upsertCheckResults = async (input: CheckResult[]) => {
  const serializedResults: CheckResultTable[] = input.map((result) => ({
    ...result,
    accountId: checkly.accountId,
    fetchedAt: new Date(),
    checkRunId: result.checkRunId,
    startedAt: new Date(result.startedAt),
    stoppedAt: new Date(result.stoppedAt),
    created_at: result.created_at
      ? new Date(result.created_at)
      : new Date(result.stoppedAt),
  }));

  await postgres<CheckResultTable>("check_results")
    .insert(serializedResults)
    .onConflict("id")
    .ignore();
};
