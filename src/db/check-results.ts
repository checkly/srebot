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
  checkId: string,
  from: Date,
  to: Date,
): Promise<CheckResultTable[]> {
  const results = await postgres<CheckResultTable>("check_results")
    .where("checkId", checkId)
    .where("startedAt", ">=", from)
    .where("startedAt", "<=", to)
    .orderBy("startedAt", "asc");

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
