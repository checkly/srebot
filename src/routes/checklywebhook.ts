import express, { Request, Response, NextFunction, text } from "express";
import { plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";
import "reflect-metadata";
import {
	CheckContextAggregator,
	ContextKey,
} from "../aggregator/ContextAggregator";
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

		if (exisingAlert && !!process.env.ALLOW_DUPLICATE_ALERTS) {
			res.status(200).json({ message: "Alert already processed" });
		} else {
			const aggregator = new CheckContextAggregator(alertDto);
			const context = await aggregator.aggregate();
			const summary = await generateContextAnalysisSummary(context);

			const alert = await prisma.alert.create({
				data: {
					data: { ...alertDto } as unknown as Prisma.InputJsonValue,
					context: {
						createMany: {
							data: context
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
								text: `:checkly-hyped-2: *Check*\n<https://app.checklyhq.com/checks/${alertDto.CHECK_ID}|${alertDto.CHECK_NAME}>`,
							},
							{
								type: "mrkdwn",
								text: `:crystal_ball: *Result*\n<${alertDto.RESULT_LINK}|Open>`,
							},
							{
								type: "mrkdwn",
								text: `:date: *Date*\n${new Date(
									alertDto.STARTED_AT
								).toLocaleString()}`,
							},
							{
								type: "mrkdwn",
								text: `:globe_with_meridians: *Location*\n${alertDto.RUN_LOCATION}`,
							},
							{
								type: "mrkdwn",
								text: `:stopwatch: *Response Time*\n${
									(checkResults?.value as any).responseTime
										? (checkResults?.value as any).responseTime + "ms"
										: "unknown"
								}`,
							},
							{
								type: "mrkdwn",
								text: `:recycle: *Attempts*\n${
									(checkResults?.value as any).attempts ?? "unknown"
								}`,
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

			// trigger the assistant for a deeper analysis
			const assistant = new SreAssistant(thread.id, alert.id, {
				username: "Checkly Alert",
				date: new Date().toISOString(),
			});

			await assistant.addMessage(
				`Investigate further. Use the following approach:
- Check if other checks are failing. Is there a related incident?
- Identify relevant github repositories that could be causing the issue
- Check the github activity in the identified repositories
- Try to identify the root cause of the issue or at least a good starting point

Continue using your tools extensively to get a holistic view of the situation.
Keep in mind, we are investigating check "${alertDto.CHECK_NAME}"`
			);

			const run = await assistant.runSync();
			const responseMessages = await getRunMessages(thread.id, run.id);

			const messages = responseMessages.map((msg) =>
				msg.content
					.filter((c) => c.type === "text")
					.map((c) => (c as any).text.value)
					.join("")
			);

			// Post assistant's analysis to the thread
			const response = await Promise.all(
				messages.map(async (msg) =>
					app.client.chat.postMessage({
						channel: process.env.SLACK_ALERT_CHANNEL_ID as string,
						thread_ts: oMessage.ts,
						text: msg,
						metadata: {
							event_type: "alert",
							event_payload: {
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
