import { plainToClass, plainToInstance } from "class-transformer";
import * as fs from "fs";
import fetch from "node-fetch";
import { Check, CheckGroup, CheckResult } from "./models";
import { PrometheusParser } from "./PrometheusParser";

interface ChecklyClientOptions {
  accountId?: string;
  apiKey?: string;
  checklyApiUrl?: string;
  checklyPrometheusKey?: string;
  prometheusIntegrationUrl?: string;
}

export class ChecklyClient {
  /**
   * The base URL of the Checkly API. Usually 'https://api.checklyhq.com/v1/'.
   */
  private readonly checklyApiUrl: string;
  private readonly accountId: string;
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
   * @param {string} [options.checklyPrometheusKey] - The Prometheus integration key. Defaults to the value of the `PROMETHEUS_INTEGRATION_KEY` environment variable.
   * @param {string} [options.prometheusIntegrationUrl] - The URL for the Prometheus integration. Defaults to 'https://api.checklyhq.com/accounts/{accountId}/v2/prometheus/metrics'.
   */
  constructor(options: ChecklyClientOptions = {}) {
    this.accountId = options.accountId || process.env.CHECKLY_ACCOUNT_ID!;
    this.apiKey = options.apiKey || process.env.CHECKLY_API_KEY!;
    this.checklyApiUrl =
      options.checklyApiUrl || "https://api.checklyhq.com/v1/";
    this.checklyPrometheusKey =
      options.checklyPrometheusKey || process.env.PROMETHEUS_INTEGRATION_KEY!;
    this.prometheusIntegrationUrl =
      options.prometheusIntegrationUrl ||
      `https://api.checklyhq.com/accounts/${this.accountId}/v2/prometheus/metrics`;
  }

  async getCheck(checkid: string): Promise<Check> {
    const url = `${this.checklyApiUrl}checks/${checkid}/`;
    return this.makeRequest(url, Check) as Promise<Check>;
  }

  async getChecks(): Promise<Check[]> {
    return this.getPaginatedDownload("checks", Check);
  }

  async getActivatedChecks(): Promise<Check[]> {
    const results = await Promise.all([
      this.getPaginatedDownload("checks", Check),
      this.getPaginatedDownload("check-groups", CheckGroup),
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

  async getPaginatedDownload<T>(
    path: string,
    type: { new (): T },
  ): Promise<T[]> {
    const limit = 100;
    let page = 1;
    const result = Array<T>();
    while (true) {
      let url = `${this.checklyApiUrl}${path}?limit=${limit}&page=${page}`;
      const checks = (await this.makeRequest(url, type)) as T[];
      result.push(...checks);
      if (checks.length < 100) {
        break;
      }
      page++;
    }
    return result;
  }

  async getCheckResult(
    checkid: string,
    checkresultid: string,
  ): Promise<CheckResult> {
    const url = `${this.checklyApiUrl}check-results/${checkid}/${checkresultid}`;
    return this.makeRequest(url, CheckResult) as Promise<CheckResult>;
  }

  async makeRequest<T>(url: string, type: { new (): T }): Promise<T | T[]> {
    try {
      const response = await fetch(url, {
        method: "GET", // Optional, default is 'GET'
        headers: {
          Authorization: `Bearer ${this.apiKey}`, // Add Authorization header
          "X-Checkly-Account": this.accountId, // Add custom X-Checkly-Account header
        },
      });
      if (!response.ok) {
        throw new Error(`Response status: ${response.status} url:${url}`);
      }

      const json = await response.json();
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
    const url = `https://api.checklyhq.com/v1/check-results/${checkid}?limit=${limit}&page=1&${hasFailuresQuery}resultType=FINAL`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "X-Checkly-Account": this.accountId,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch failed API results: ${response.status}`);
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
