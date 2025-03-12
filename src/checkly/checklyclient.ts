import { plainToClass, plainToInstance } from "class-transformer";
import * as fs from "node:fs";
import type { RequestInfo, RequestInit } from "node-fetch";
import fetch from "node-fetch";
import process from "node:process";
import {
  Check,
  CheckGroup,
  CheckResult,
  CheckStatus,
  Reporting,
} from "./models";
import { PrometheusParser } from "./PrometheusParser";
import { log } from "../log";

interface ChecklyClientOptions {
  accountId?: string;
  apiKey?: string;
  checklyApiUrl?: string;
  checklyAppUrl?: string;
  checklyPrometheusKey?: string;
  prometheusIntegrationUrl?: string;
}

type RetryOptions = {
  attempt: number;
  maxAttempts: number;
};

export class ChecklyClient {
  /**
   * The base URL of the Checkly API. Usually 'https://api.checklyhq.com/v1/'.
   */
  private readonly checklyApiUrl: string;
  private readonly checklyAppUrl: string;
  public readonly accountId: string;
  private readonly apiKey: string;
  private readonly checklyPrometheusKey: string;
  private readonly prometheusIntegrationUrl: string;

  /**
   * Creates an instance of ChecklyClient.
   * Use it to interact with the Checkly API in a nice way.
   * @param {ChecklyClientOptions} [options={}] - The options to configure the ChecklyClient. Can include the account ID, API key, and Checkly API URL.
   * @param {string} [options.accountId] - The account ID to use for authentication. Defaults to the value of the `CHECKLY_ACCOUNT_ID` environment variable.
   * @param {string} [options.apiKey] - The API key to use for authentication. Defaults to the value of the `CHECKLY_API_KEY` environment variable.
   * @param {string} [options.checklyApiUrl] - The base URL of the Checkly API. Defaults to 'https://api.checklyhq.com/v1/'.
   * @param {string} [options.checklyAppUrl] - The base URL of the Checkly App. Defaults to 'https://app.checklyhq.com/'.
   * @param {string} [options.checklyPrometheusKey] - The Prometheus integration key. Defaults to the value of the `PROMETHEUS_INTEGRATION_KEY` environment variable.
   * @param {string} [options.prometheusIntegrationUrl] - The URL for the Prometheus integration. Defaults to 'https://api.checklyhq.com/accounts/{accountId}/v2/prometheus/metrics'.
   */
  constructor(options: ChecklyClientOptions = {}) {
    this.accountId = options.accountId || process.env.CHECKLY_ACCOUNT_ID!;
    this.apiKey = options.apiKey || process.env.CHECKLY_API_KEY!;
    this.checklyApiUrl =
      options.checklyApiUrl || "https://api.checklyhq.com/v1/";
    this.checklyAppUrl = options.checklyAppUrl || "https://app.checklyhq.com/";
    this.checklyPrometheusKey =
      options.checklyPrometheusKey || process.env.PROMETHEUS_INTEGRATION_KEY!;
    this.prometheusIntegrationUrl =
      options.prometheusIntegrationUrl ||
      `https://api.checklyhq.com/accounts/${this.accountId}/v2/prometheus/metrics`;
  }

  getCheck(
    checkid: string,
    options?: { includeDependencies?: boolean },
  ): Promise<Check> {
    const includeDependenciesQuery = options?.includeDependencies
      ? `&includeDependencies=${options.includeDependencies}`
      : "";

    const url = `${this.checklyApiUrl}checks/${checkid}?${includeDependenciesQuery}`;
    return this.makeRequest(url, Check) as Promise<Check>;
  }

  getCheckUrl(checkId: string): string {
    return `${this.checklyAppUrl}checks/${checkId}`;
  }

  getChecks(): Promise<Check[]> {
    return this.getPaginatedDownload("checks", Check);
  }

  getChecksByGroup(groupId: number): Promise<Check[]> {
    const url = `check-groups/${groupId}/checks`;
    return this.getPaginatedDownload(url, Check) as Promise<Check[]>;
  }

  getCheckGroups(): Promise<CheckGroup[]> {
    return this.getPaginatedDownload("check-groups", CheckGroup);
  }

  getCheckGroup(groupId: number): Promise<CheckGroup> {
    const url = `${this.checklyApiUrl}check-groups/${groupId}`;
    return this.makeRequest(url, CheckGroup, {
      method: "GET",
    }) as Promise<CheckGroup>;
  }

  async getActivatedChecks(): Promise<Check[]> {
    const results = await Promise.all([
      this.getChecks(),
      this.getCheckGroups(),
    ]);
    const groups = results[1];
    const groupMap = new Map<number, CheckGroup>();
    groups.forEach((group) => {
      groupMap.set(group.id, group);
    });
    const s = results[0].map((check) => {
      if (check.activated && !check.groupId) {
        return check;
      }
      if (check.groupId) {
        const group = groupMap.get(check.groupId);
        if (group?.activated && check.activated) {
          return check;
        }
      }
    });
    return s.filter((x) => x !== undefined) as Check[];
  }

  getCheckResultsByCheckId(
    checkId: string,
    config?: {
      hasFailures?: boolean;
      resultType?: "ALL" | "FINAL" | "ATTEMPT";
      from?: Date;
      to?: Date;
      limit?: number;
    },
  ): Promise<CheckResult[]> {
    const url = this.buildCheckResultsUrl(config, checkId);

    return this.fetchWithCursor<CheckResult>(url);
  }

  getCheckResultsByCheckIdGenerator(
    checkId: string,
    config?: {
      hasFailures?: boolean;
      resultType?: "ALL" | "FINAL" | "ATTEMPT";
      from?: Date;
      to?: Date;
      limit?: number;
    },
  ): AsyncGenerator<CheckResult[]> {
    const url = this.buildCheckResultsUrl(config, checkId);

    return this.fetchWithCursorGenerator<CheckResult>(url);
  }

  private buildCheckResultsUrl = (
    config:
      | {
          hasFailures?: boolean;
          resultType?: "ALL" | "FINAL" | "ATTEMPT";
          from?: Date;
          to?: Date;
          limit?: number;
        }
      | undefined
      | {
          hasFailures?: boolean | undefined;
          resultType?: "ALL" | "FINAL" | "ATTEMPT" | undefined;
          from?: Date | undefined;
          to?: Date | undefined;
          limit?: number | undefined;
        },
    checkId: string,
  ) => {
    let hasFailuresQuery = "";
    if (!!config && !!config.hasFailures) {
      hasFailuresQuery = `&hasFailures=${config.hasFailures}`;
    }
    let resultTypeQuery = "";
    if (!!config && !!config.resultType) {
      resultTypeQuery = `&resultType=${config.resultType}`;
    }
    let fromQuery = "";
    if (!!config && !!config.from) {
      fromQuery = `&from=${Math.floor(config.from.getTime() / 1000)}`;
    }
    let toQuery = "";
    if (!!config && !!config.to) {
      toQuery = `&to=${Math.floor(config.to.getTime() / 1000)}`;
    }
    const limitQuery = `&limit=${config?.limit ?? 100}`;
    const url =
      `${this.checklyApiUrl}check-results/${checkId}?${hasFailuresQuery}${resultTypeQuery}${fromQuery}${toQuery}${limitQuery}`.replace(
        "v1",
        "v2",
      );
    return url;
  };

  async getPaginatedDownload<T>(
    path: string,
    type: { new (): T },
  ): Promise<T[]> {
    const limit = 100;
    let page = 1;
    const result = Array<T>();
    while (true) {
      const url = `${this.checklyApiUrl}${path}?limit=${limit}&page=${page}`;
      const checks = (await this.makeRequest(url, type)) as T[];
      result.push(...checks);
      if (checks.length < 100) {
        break;
      }
      page++;
    }
    return result;
  }

  getCheckResult(checkid: string, checkresultid: string): Promise<CheckResult> {
    const url = `${this.checklyApiUrl}check-results/${checkid}/${checkresultid}`;
    return this.makeRequest(url, CheckResult, {
      retryOptions: { attempt: 1, maxAttempts: 3 },
    }) as Promise<CheckResult>;
  }

  getCheckResultAppUrl(checkId: string, checkResultId: string): string {
    return `${this.checklyAppUrl}checks/${checkId}/check-session/results/${checkResultId}`;
  }

  getDashboards() {
    const url = `${this.checklyApiUrl}dashboards`;
    return this.makeRequest(url, Object) as Promise<Object>;
  }

  getDashboard(id: string) {
    const url = `${this.checklyApiUrl}dashboards/${id}`;
    return this.makeRequest(url, Object) as Promise<Object>;
  }

  getCheckMetrics(
    checkType: "HEARTBEAT" | "BROWSER" | "API" | "MULTI_STEP" | "TCP",
  ) {
    const url = `${this.checklyApiUrl}analytics/metrics?checkType=${checkType}`;
    return this.makeRequest(url, Object) as Promise<Object>;
  }

  getReporting(options?: { quickRange: "last24Hrs" | "last7Days" }) {
    const url = `${this.checklyApiUrl}reporting`;
    return this.makeRequest(url, Reporting) as Promise<Reporting[]>;
  }

  getStatuses() {
    const url = `${this.checklyApiUrl}check-statuses`;
    return this.makeRequest(url, CheckStatus) as Promise<CheckStatus[]>;
  }

  runCheck(checkId: string) {
    const url = `${this.checklyApiUrl}triggers/checks/${checkId}`;
    return this.makeRequest(url, Object, { method: "POST" }) as Promise<Object>;
  }

  private async fetch(
    url: string,
    options?: {
      method?: "GET" | "POST";
      retryOptions?: { attempt: number; maxAttempts: number };
    },
  ): Promise<any> {
    const response = await this.fetchWithRetry(
      url,
      {
        method: options?.method || "GET", // Optional, default is 'GET'
        headers: {
          Authorization: `Bearer ${this.apiKey}`, // Add Authorization header
          "X-Checkly-Account": this.accountId, // Add custom X-Checkly-Account header
        },
      },
      options?.retryOptions,
    );
    if (!response.ok) {
      throw new Error(
        `Response status: ${response.status} url:${url}:\n${response.statusText}, statusText: ${response.statusText}`,
      );
    }

    return response.json();
  }

  private async fetchWithRetry(
    url: RequestInfo,
    init?: RequestInit,
    options?: {
      attempt: number;
      maxAttempts: number;
    },
  ): Promise<any> {
    try {
      const response = await fetch(url, init);
      if (response.ok) {
        return response;
      }

      const isRetryable = response.status === 429 || response.status >= 500;
      const hasAttemptsLeft =
        options && options?.attempt <= options?.maxAttempts;
      const willRetry = isRetryable && hasAttemptsLeft;
      if (!willRetry) {
        return response;
      }

      const retryAfterHeader = response.headers.get("Retry-After");
      const exponentialDelay = Math.pow(2, options.attempt) * 1000; // exponential delay
      const retryDelayMs = retryAfterHeader
        ? parseInt(retryAfterHeader) * 1000 + 1000 // add 1 second to the retry delay just to be on the safe side
        : exponentialDelay;

      log.debug(
        {
          attempt: options?.attempt,
          maxAttempts: options?.maxAttempts,
          retryDelayMs: retryDelayMs,
          url: url,
          retryAfterHeader: retryAfterHeader,
          responseStatus: response.status,
        },
        `Fetch failed, waiting for retry`,
      );

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return this.fetchWithRetry(url, init, {
        attempt: options.attempt + 1,
        maxAttempts: options.maxAttempts,
      });
    } catch (err) {
      const hasAttemptsLeft =
        options && options?.attempt <= options?.maxAttempts;
      if (!hasAttemptsLeft) {
        throw err;
      }

      const retryDelay = Math.pow(2, options.attempt) * 1000; // exponential delay
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return this.fetchWithRetry(url, init, {
        attempt: options.attempt + 1,
        maxAttempts: options.maxAttempts,
      });
    }
  }

  private async fetchWithCursor<T>(
    url: string,
    options?: { method: "GET" | "POST" },
  ): Promise<T[]> {
    const retryOptions: RetryOptions = { attempt: 1, maxAttempts: 5 };
    const { entries: results, nextId } = await this.fetch(url, {
      ...options,
      retryOptions,
    });

    let cursor = nextId;
    while (cursor) {
      const { entries, nextId } = await this.fetch(url + "&nextId=" + cursor, {
        ...options,
        retryOptions,
      });
      results.push(...entries);
      cursor = nextId;
    }

    return results;
  }

  private async *fetchWithCursorGenerator<T>(
    url: string,
    options?: { method: "GET" | "POST" },
  ): AsyncGenerator<T[]> {
    const retryOptions: RetryOptions = { attempt: 1, maxAttempts: 3 };
    const { entries, nextId } = await this.fetch(url, {
      ...options,
      retryOptions,
    });
    yield entries;

    let cursor = nextId;
    while (cursor) {
      const { entries, nextId } = await this.fetch(url + "&nextId=" + cursor, {
        ...options,
        retryOptions,
      });
      yield entries;
      cursor = nextId;
    }
  }

  private async makeRequest<T>(
    url: string,
    type: { new (): T },
    options?: {
      method?: "GET" | "POST";
      version?: "v1" | "v2";
      retryOptions?: RetryOptions;
    },
  ): Promise<T | T[]> {
    try {
      const json = await this.fetch(url, {
        method: options?.method || "GET",
        retryOptions: options?.retryOptions,
      });
      if (Array.isArray(json)) {
        return plainToInstance(type, json) as T[];
      } else {
        return plainToClass(type, json) as T;
      }
    } catch (error) {
      console.error(error.message);
      throw error;
    }
  }

  async downloadAsset(assetUrl: string, outputFilePath: string): Promise<void> {
    const url = assetUrl;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "X-Checkly-Account": this.accountId,
      },
    });

    if (!response.ok) {
      throw new Error(`Response status: ${response.status} url:${url}`);
    }

    const fileStream = fs.createWriteStream(outputFilePath);
    return new Promise((resolve, reject) => {
      response!.body!.pipe(fileStream);
      response!.body!.on("error", (err: Error) => {
        reject(err);
      });
      fileStream.on("finish", () => {
        resolve();
      });
    });
  }

  // Uses the last 6 hours as a time frame
  async getCheckResults(
    checkid: string,
    hasFailures?: boolean,
    limit?: number,
  ): Promise<CheckResult[]> {
    limit = limit || 100;
    let hasFailuresQuery = "";
    if (hasFailures !== undefined) {
      hasFailuresQuery = `hasFailures=${hasFailures}&`;
    }
    const url = `https://api.checklyhq.com/v1/check-results/${checkid}?limit=${limit}&page=1&${hasFailuresQuery}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "X-Checkly-Account": this.accountId,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch failed API results: ${response.status}:\n ${response.statusText}`,
      );
    }
    const json = await response.json();
    const result = json.map((x) => plainToClass(CheckResult, x));
    return result;
  }

  async getPrometheusCheckStatus() {
    try {
      const response = await fetch(this.prometheusIntegrationUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.checklyPrometheusKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      const metrics = PrometheusParser.parse(text);
      const statusmetric = metrics.filter(
        (m) => m.metricName === "checkly_check_status",
      )[0];

      const ac = statusmetric.values.filter(
        (v) => v.labels.activated === "true",
      );
      // status is either failing, passing or degraded
      // the value is 1 if status is true, 0 if false
      const failing = ac.filter(
        (v) => v.labels.status === "failing" && v.value === 1,
      );
      const passing = ac.filter(
        (v) => v.labels.status === "passing" && v.value === 1,
      );
      const degraded = ac.filter(
        (v) => v.labels.status === "degraded" && v.value === 1,
      );
      return { failing, passing, degraded };
    } catch (error) {
      console.error("Error fetching Prometheus metrics:", error);
      throw error;
    }
  }
}
