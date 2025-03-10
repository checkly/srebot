export type ErrorMessage = {
  message: string;
  stack: string;
};
export type LogEntry = {
  time: number;
  msg: string;
  level: string;
};

export class CheckGroup {
  id: number;
  name: string;
  concurrency: number;
  apiCheckDefaults: {
    url: string;
    headers: {
      key: string;
      value: string;
      locked: boolean;
    }[];
    basicAuth: {
      password: string;
      username: string;
    };
    assertions: any[];
    queryParameters: any[];
  };
  alertSettings: {
    reminders: {
      amount: number;
      interval: number;
    };
    escalationType: string;
    runBasedEscalation: {
      failedRunThreshold: number;
    };
    timeBasedEscalation: {
      minutesFailingThreshold: number;
    };
  };
  environmentVariables: any[];
  setupSnippetId: string | null;
  tearDownSnippetId: string | null;
  localSetupScript: string | null;
  localTearDownScript: string | null;
  activated: boolean;
  muted: boolean;
  useGlobalAlertSettings: boolean;
  doubleCheck: boolean;
  locations: string[];
  tags: any[];
  created_at: string;
  updated_at: string;
  runtimeId: string | null;
  retryStrategy: string | null;
  runParallel: boolean;
  alertChannelSubscriptions: {
    alertChannelId: number;
    activated: boolean;
  }[];
  privateLocations: any[];
}

export class Check {
  id: string;
  checkType: string;
  name: string;
  frequency: number;
  frequencyOffset: number;
  activated: boolean;
  muted: boolean;
  shouldFail: boolean;
  locations: string[];
  script: string | null;
  created_at: string;
  updated_at: string;
  environmentVariables: any[];
  doubleCheck: boolean;
  tags: any[];
  sslCheckDomain: string;
  setupSnippetId: string | null;
  tearDownSnippetId: string | null;
  localSetupScript: string | null;
  localTearDownScript: string | null;
  alertSettings: {
    reminders: {
      amount: number;
      interval: number;
    };
    escalationType: string;
    runBasedEscalation: {
      failedRunThreshold: number;
    };
    timeBasedEscalation: {
      minutesFailingThreshold: number;
    };
  };
  useGlobalAlertSettings: boolean;
  degradedResponseTime: number;
  maxResponseTime: number;
  groupId: number | null;
  groupOrder: number | null;
  runtimeId: string | null;
  scriptPath: string | null;
  retryStrategy: string | null;
  runParallel: boolean;
  request: {
    method: string;
    url: string;
    body: string;
    bodyType: string;
    headers: {
      key: string;
      value: string;
      locked: boolean;
    }[];
    queryParameters: any[];
    assertions: any[];
    basicAuth: {
      password: string;
      username: string;
    };
    followRedirects: boolean;
    skipSSL: boolean;
    ipFamily: string;
  };
  alertChannelSubscriptions: {
    alertChannelId: number;
    activated: boolean;
  }[];
  privateLocations: any[];
  group?: CheckGroup;
  dependencies?: { path: string; content: string }[];
}

export class CheckResult {
  id: string;
  name: string;
  checkId: string;
  hasFailures: boolean;
  hasErrors: boolean;
  isDegraded: boolean;
  overMaxResponseTime: boolean;
  runLocation: string;
  startedAt: string; // ISO date string
  stoppedAt: string; // ISO date string
  created_at: string; // ISO date string
  responseTime: number;
  apiCheckResult: {
    assertions: Array<{
      source: string;
      target: number;
      error: string | null;
    }>;
    request: {
      method: string;
      url: string;
      data: string;
      headers: Record<string, string>;
      params: Record<string, string>;
    };
    response: {
      status: number;
      statusText: string;
      body: string;
      headers: Record<string, string>;
      timings: Record<string, unknown>;
      timingPhases: Record<string, unknown>;
    };
    requestError: string | null;
    jobLog: {
      setup: Array<LogEntry>;
      request: Array<LogEntry>;
      teardown: Array<LogEntry>;
    };
    jobAssets: unknown | null;
  } | null;
  browserCheckResult: {
    errors: Array<ErrorMessage>;
    jobLog: Array<LogEntry>;
    playwrightTestTraces: Array<string>;
    playwrightTestJsonReportFile: string;
  } | null;
  multiStepCheckResult: {
    errors: Array<ErrorMessage>;
    endTime: number;
    startTime: number;
    runtimeVersion: string;
    jobLog: Array<LogEntry>;
    jobAssets: Array<unknown>;
    playwrightTestTraces: Array<string>;
    playwrightTestJsonReportFile: string;
  } | null;
  checkRunId: number;
  attempts: number;
  resultType: string;
  sequenceId: string;

  getLog(): string {
    const jobLog =
      this.apiCheckResult?.jobLog.request ||
      this.browserCheckResult?.jobLog ||
      this.multiStepCheckResult?.jobLog ||
      [];

    return jobLog
      .map(
        (logEntry) => `${logEntry.time} - ${logEntry.level}: ${logEntry.msg}`,
      )
      .join("\n");
  }
}

export class PrometheusCheckMetric {
  name: string;
  checkType: string;
  muted: boolean;
  activated: boolean;
  checkId: string;
  tags: string[];
  group: string;
  status: "passing" | "failing" | "degraded";
  value: number;

  static fromJson(json: {
    labels: {
      name: string;
      check_type: string;
      muted: string;
      activated: string;
      check_id: string;
      tags: string;
      group: string;
      status: string;
    };
    value: number;
  }): PrometheusCheckMetric {
    const metric = {
      ...json.labels,
      tags: json.labels.tags.split(","),
      checkId: json.labels.check_id,
      checkType: json.labels.check_type,
      muted: json.labels.muted === "true",
      activated: json.labels.activated === "true",
      status: json.labels.status as "passing" | "failing" | "degraded",
      value: json.value,
    };

    return metric;
  }
}

export class Reporting {
  name: string;
  checkId: string;
  checkType: string;
  deactivated: boolean;
  tags: string[];
  aggregate: {
    successRatio: number;
    avg: number;
    p95: number;
    p99: number;
  };
}

export class CheckStatus {
  name: string;
  hasErrors: boolean;
  hasFailures: boolean;
  longestRun: number | null;
  shortestRun: number | null;
  checkId: string;
  created_at: string;
  updated_at: string;
  lastRunLocation: string | null;
  lastCheckRunId: string | null;
  sslDaysRemaining: number | null;
  isDegraded: boolean;
}

export class CheckSyncTracking {
  checkId: string;
  accountId: string;
  from: Date;
  to: Date;
  hasData: boolean;
  syncedAt: Date;
}
