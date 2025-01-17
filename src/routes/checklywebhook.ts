import express, { Request, Response } from "express";
import { plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";
import "reflect-metadata";
import { CheckContextAggregator, ContextKey, } from "../aggregator/ContextAggregator";
import { generateContextAnalysisSummary } from "../aggregator/chains";
import { AlertType, WebhookAlertDto } from "../checkly/alertDTO";
import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";
import { app } from "../slackbot/app";
import { getOpenaiClient } from "../ai/openai";

const router = express.Router();

router.get("/", (req: Request, res: Response) => {
  res.json({ message: "Hello from Express!" });
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const alertDto = plainToInstance(WebhookAlertDto, body, {
      enableImplicitConversion: true,
    });

    // Validate the DTO
    await validateOrReject(alertDto);

    const exisingAlert = await prisma.alert.findFirst({
      where: {
        AND: [
          {
            data: {
              path: ["CHECK_RESULT_ID"],
              equals: alertDto.CHECK_RESULT_ID,
            },
          },
          {
            data: {
              path: ["CHECK_ID"],
              equals: alertDto.CHECK_ID,
            },
          },
        ],
      },
    });

    if (exisingAlert && !!process.env.PREVENT_DUPLICATE_ALERTS) {
      console.log("Alert already processed");
      res.status(200).json({ message: "Alert already processed" });
    } else {
      console.log("Creating new alert");

      // Create the alert first with the initial data, prevent message from being processed over and over
      const alert = await prisma.alert.create({
        data: {
          data: { ...alertDto } as unknown as Prisma.InputJsonValue,
          summary: "Processing...",
        },
      });

      const aggregator = new CheckContextAggregator(alertDto);
      const context = await aggregator.aggregate();
      const summary = await generateContextAnalysisSummary(context);

      await prisma.alert.update({
        where: { id: alert.id },
        data: {
          summary,
          context: {
            createMany: {
              data: context
                .filter((c) => c.key && c.value)
                .map((c) => ({
                  key: c.key,
                  value: c.value as any,
                  source: c.source,
                })),
            },
          },
        },
      });

      const checkResults = context.find(
        (c) => c.key === ContextKey.ChecklyResults
      );

      const thread = await getOpenaiClient().beta.threads.create({
        messages: [
          {
            role: "assistant",
            content:
              "*Alert:* <https://app.checklyhq.com/checks/" +
              alertDto.CHECK_ID +
              "|" +
              alertDto.CHECK_NAME +
              ">\n\n*Summary:* " +
              summary,
          },
        ],
      });

      let headerText =
        alertDto.ALERT_TYPE === AlertType.ALERT_RECOVERY
          ? "✅ " + alertDto.CHECK_NAME + " has recovered ✅"
          : "🚨 " + alertDto.CHECK_NAME + " has failed 🚨";
      await app.client.chat.postMessage({
        channel: process.env.SLACK_ALERT_CHANNEL_ID as string,
        metadata: {
          event_type: "alert",
          event_payload: {
            alertId: alert.id,
            threadId: thread.id,
          },
        },
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: headerText,
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `:checkly-hyped-2: <https://app.checklyhq.com/checks/${alertDto.CHECK_ID}|*${alertDto.CHECK_NAME}*>`,
              },
              {
                type: "mrkdwn",
                text: `:crystal_ball: <${alertDto.RESULT_LINK}|*View Result*>`,
              },
              {
                type: "mrkdwn",
                text: `:date: *${new Date(
                  alertDto.STARTED_AT
                ).toLocaleString()}*`,
              },
              {
                type: "mrkdwn",
                text: `:globe_with_meridians: *${alertDto.RUN_LOCATION}*`,
              },
              {
                type: "mrkdwn",
                text: `:stopwatch: *${
                  (checkResults?.value as any)?.responseTime
                    ? (checkResults?.value as any)?.responseTime + "ms"
                    : "unknown"
                } Response Time*`,
              },
              {
                type: "mrkdwn",
                text: `:recycle: *${
                  (checkResults?.value as any)?.attempts ?? "unknown"
                } Attempts*`,
              },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${summary}`,
            },
          },
        ],
      });
    }
  } catch (error) {
    console.error("Error parsing or validating request body:", error);
    res.status(400).json({ message: "Invalid request body" });
  }
});

export default router;
