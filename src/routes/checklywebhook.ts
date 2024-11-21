import express, { Request, Response, NextFunction } from "express";
import { plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";
import "reflect-metadata";
import { CheckContextAggregator } from "../aggregator/ContextAggregator";
import {
	generateContextAnalysis,
	generateContextAnalysisSummary,
} from "../aggregator/chains";
import { WebhookAlertDto } from "../checkly/alertDTO";
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

		const aggregator = new CheckContextAggregator(alertDto);
		const context = await aggregator.aggregate();
		const contextAnalysis = await generateContextAnalysis(context);
		const summary = await generateContextAnalysisSummary(contextAnalysis);

		const alert = await prisma.alert.create({
			data: {
				data: { ...alertDto } as unknown as Prisma.InputJsonValue,
				context: JSON.stringify(contextAnalysis),
				summary,
			},
		});

		const thread = await getOpenaiClient().beta.threads.create({
			messages: [
				{
					role: "assistant",
					content:
						"New alert: " + alertDto.CHECK_NAME + "\nSummary: " + summary,
				},
			],
		});

		const alertMessage = await app.client.chat.postMessage({
			channel: "C07V9GNU9L6",
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
						text: "🚨 New Alert",
						emoji: true,
					},
				},
				{
					type: "divider",
				},
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `*${alertDto.CHECK_NAME}*: ${alertDto.CHECK_ID}`,
					},
				},
				{
					type: "actions",
					elements: [
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "View Check",
								emoji: true,
							},
							url: `https://app.checklyhq.com/checks/${alertDto.CHECK_ID}`,
						},
					],
				},
				// {
				// 	type: "section",
				// 	text: {
				// 		type: "mrkdwn",
				// 		text: `*Summary*\n${summary}`,
				// 	},
				// },
				{
					type: "context",
					elements: [
						{
							type: "mrkdwn",
							text: `🕐 Alert created at: ${new Date().toLocaleString()}`,
						},
					],
				},
			],
		});

		await app.client.chat.postMessage({
			channel: "C07V9GNU9L6",
			text: `*Summary*\n${summary}`,
			thread_ts: alertMessage.ts,
		});

		res.json({ message: "OK" });
	} catch (error) {
		console.error("Error parsing or validating request body:", error);
		res.status(400).json({ message: "Invalid request body" });
	}
});

export default router;
