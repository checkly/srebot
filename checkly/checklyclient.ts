import { plainToClass } from 'class-transformer';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';

export class ChecklyClient {
  checklyApiUrl: string = 'https://api.checklyhq.com/v1/';
  private readonly accountId: string;
  private readonly apiKey: string;
  constructor() {
    this.accountId = process.env.CHECKLY_ACCOUNT_ID!;
    this.apiKey = process.env.CHECKLY_API_KEY!;
  }

  async getCheck(checkid: string): Promise<Check> {
    const url = `${this.checklyApiUrl}checks/${checkid}/`;
    return this.makeRequest(url, Check);
  }
  async getCheckResult(
    checkid: string,
    checkresultid: string,
  ): Promise<CheckResult> {
    const url = `${this.checklyApiUrl}check-results/${checkid}/${checkresultid}`;
    return this.makeRequest(url, CheckResult);
  }
  async makeRequest<T>(url: string, type: { new (): T }): Promise<T> {
    try {
      const response = await fetch(url, {
        method: 'GET', // Optional, default is 'GET'
        headers: {
          Authorization: `Bearer ${this.apiKey}`, // Add Authorization header
          'X-Checkly-Account': this.accountId, // Add custom X-Checkly-Account header
        },
      });
      if (!response.ok) {
        throw new Error(`Response status: ${response.status} url:${url}`);
      }

      const json = await response.json();
      const result = plainToClass(type, json);
      return result;
    } catch (error) {
      console.error(error.message);
      throw error;
    }
  }
  async downloadAsset(assetUrl: string, outputFilePath: string): Promise<void> {
    const url = assetUrl;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'X-Checkly-Account': this.accountId,
      },
    });

    if (!response.ok) {
      throw new Error(`Response status: ${response.status} url:${url}`);
    }

    const fileStream = fs.createWriteStream(outputFilePath);
    return new Promise((resolve, reject) => {
      response!.body!.pipe(fileStream);
      response!.body!.on('error', (err: Error) => {
        reject(err);
      });
      fileStream.on('finish', () => {
        resolve();
      });
    });
  }
  // New function
  async getFailedAPIResults(checkid: string): Promise<CheckResult[]> {
    const url = `https://api.checklyhq.com/v1/check-results/${checkid}?limit=10&page=1&hasFailures=true&resultType=FINAL`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'X-Checkly-Account': this.accountId,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch failed API results: ${response.status}`);
    }
    const json = await response.json();
    const result = json.map((x) => plainToClass(CheckResult, x));
    return result;
  }
}

export type ErrorMessage = {
  message: string;
  stack: string;
};
export type LogEntry = {
  time: number;
  msg: string;
  level: string;
};

export class Check {
  id: string;
  name: string;
  script: string;
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
    jobLog: Array<LogEntry>;
    jobAssets: unknown | null;
  } | null;
  browserCheckResult: {
    jobLog: Array<LogEntry>;
    playwrightTestTraces: Array<string>;
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
      this.apiCheckResult?.jobLog ||
      this.browserCheckResult?.jobLog ||
      this.multiStepCheckResult?.jobLog ||
      [];

    return jobLog
      .map(
        (logEntry) => `${logEntry.time} - ${logEntry.level}: ${logEntry.msg}`,
      )
      .join('\n');
  }
}
