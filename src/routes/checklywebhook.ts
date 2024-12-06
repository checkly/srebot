import express, { Request, Response, NextFunction, text } from "express";
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
import { SreAssistant } from "../sre-assistant/SreAssistant";
import { getRunMessages } from "../ai/utils";

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

		if (exisingAlert && process.env.ALLOW_DUPLICATE_ALERTS !== "true") {
			res.status(200).json({ message: "Alert already processed" });
		} else {
			const aggregator = new CheckContextAggregator(alertDto);
			const context = await aggregator.aggregate();

			const contextAnalysis = await generateContextAnalysis(context);
			const summary = await generateContextAnalysisSummary(contextAnalysis);

			const alert = await prisma.alert.create({
				data: {
					data: { ...alertDto } as unknown as Prisma.InputJsonValue,
					context: {
						createMany: {
							data: contextAnalysis
								.filter((c) => c.key && c.value)
								.map((c) => ({
									key: c.key,
									value: c.value as any,
								})),
						},
					},
					summary,
				},
			});

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

			const oMessage = await app.client.chat.postMessage({
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
							text: "🚨 " + alertDto.CHECK_NAME + " has failed 🚨",
							emoji: true,
						},
					},
					{
						type: "section",
						fields: [
							{
								type: "mrkdwn",
								text: `🩺 *Check:* <https://app.checklyhq.com/checks/${alertDto.CHECK_ID}|${alertDto.CHECK_NAME}>`,
							},
							{
								type: "mrkdwn",
								text: `🔮 *Result:* <${alertDto.RESULT_LINK}|View>`,
							},
							{
								type: "mrkdwn",
								text: `📅 *When:* ${new Date(
									alertDto.STARTED_AT
								).toLocaleString()}`,
							},
							{
								type: "mrkdwn",
								text: `🌍 *Location:* ${alertDto.RUN_LOCATION}`,
							},
						],
					},
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: `*Summary*\n${summary}`,
						},
					},
				],
			});

			// trigger the assistant for a deeper analysis
			const assistant = new SreAssistant(thread.id, alert.id, {
				username: "Checkly Alert",
				date: new Date().toISOString(),
			});

			await assistant.addMessage(
				`What happened? Check *GitHub* & Investigate further...`
			);

			const run = await assistant.runSync();
			const responseMessages = await getRunMessages(thread.id, run.id);

			// Post assistant's analysis to the thread
			await Promise.all(
				responseMessages.map((msg) =>
					app.client.chat.postMessage({
						channel: process.env.SLACK_ALERT_CHANNEL_ID as string,
						thread_ts: oMessage.ts,
						text: msg.content
							.filter((c) => c.type === "text")
							.map((c) => (c as any).text.value)
							.join(""),
						metadata: {
							event_type: "alert",
							event_payload: {
								alertId: alert.id,
								threadId: thread.id,
							},
						},
					})
				)
			);

			res.json({ message: "OK" });
		}
	} catch (error) {
		console.error("Error parsing or validating request body:", error);
		res.status(400).json({ message: "Invalid request body" });
	}
});

export default router;
