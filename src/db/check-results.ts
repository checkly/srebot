import postgres from "./postgres";

export interface CheckResultTable {
  id: string;
  checkId: string;
  accountId: string;
  checkRunId: bigint;
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
