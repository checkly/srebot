import { AlertType, WebhookAlertDto } from "../checkly/alertDTO";
import { channelSummaryPrompt } from "./slack";
import {
  generateFindRelevantReleasesPrompt,
  GithubReleaseForPrompt,
} from "./github";
import { Check } from "../checkly/models";

describe("Prompt Validation Tests", () => {
  describe("Slack Prompts", () => {
    const validAlert = {
      ALERT_TITLE: "Test Alert",
      ALERT_TYPE: AlertType.ALERT_DEGRADED,
      CHECK_NAME: "Test Check",
      RUN_LOCATION: "us-east-1",
      RESPONSE_TIME: 1000,
      TAGS: ["test"],
    };

    const validMessageHistory = [
      {
        plaintext: "Test message 1",
        ts: "1234567890.123456",
      },
      {
        plaintext: "Test message 2",
        ts: "1234567891.123456",
      },
    ];

    it("should throw when alert object is empty", () => {
      expect(() =>
        channelSummaryPrompt({} as WebhookAlertDto, validMessageHistory),
      ).toThrow();
    });

    it("should throw when message history is empty", () => {
      expect(() =>
        channelSummaryPrompt(validAlert as WebhookAlertDto, []),
      ).toThrow();
    });

    it("should not throw with valid inputs", () => {
      expect(() =>
        channelSummaryPrompt(
          validAlert as WebhookAlertDto,
          validMessageHistory,
        ),
      ).not.toThrow();
    });
  });

  describe("Github Prompts", () => {
    const validCheck = {
      id: "1",
      checkType: "BROWSER",
      name: "Test Check",
      frequency: 10,
      frequencyOffset: 0,
      activated: true,
      muted: false,
      shouldFail: false,
      locations: ["us-east-1"],
      script: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      environmentVariables: [],
      doubleCheck: false,
      tags: [],
      sslCheckDomain: "",
      setupSnippetId: null,
      tearDownSnippetId: null,
      localSetupScript: null,
      localTearDownScript: null,
      alertSettings: {
        reminders: {
          amount: 0,
          interval: 5,
        },
        escalationType: "NONE",
        runBasedEscalation: {
          failedRunThreshold: 1,
        },
        timeBasedEscalation: {
          minutesFailingThreshold: 5,
        },
      },
      useGlobalAlertSettings: true,
      degradedResponseTime: 10000,
      maxResponseTime: 20000,
      groupId: null,
      groupOrder: null,
      runtimeId: null,
      scriptPath: null,
      retryStrategy: null,
      runParallel: false,
      request: {
        method: "GET",
        url: "https://example.com",
        body: "",
        bodyType: "NONE",
        headers: [],
        queryParameters: [],
        assertions: [],
        basicAuth: {
          username: "",
          password: "",
        },
        followRedirects: true,
        skipSSL: false,
        ipFamily: "IPV4",
      },
      alertChannelSubscriptions: [],
      privateLocations: [],
    };

    const validReleases: GithubReleaseForPrompt[] = [
      {
        id: "1",
        repo: "test-repo",
        release: "v1.0.0",
        summary: "Test release",
      },
    ];

    it("should throw when check object is empty", () => {
      expect(() =>
        generateFindRelevantReleasesPrompt(
          {} as Check,
          "test result",
          validReleases,
        ),
      ).toThrow();
    });

    it("should throw when check result is empty", () => {
      expect(() =>
        generateFindRelevantReleasesPrompt(validCheck, "", validReleases),
      ).toThrow();
    });

    it("should throw when releases array is empty", () => {
      expect(() =>
        generateFindRelevantReleasesPrompt(validCheck, "test result", []),
      ).toThrow();
    });

    it("should not throw with valid inputs", () => {
      expect(() =>
        generateFindRelevantReleasesPrompt(
          validCheck,
          "test result",
          validReleases,
        ),
      ).not.toThrow();
    });
  });
});
