import { NextResponse, NextRequest } from "next/server";
import { plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";

import "reflect-metadata";
import { CheckContextAggregator } from "src/aggregator/ContextAggregator";
import {
	generateContextAnalysis,
	generateContextAnalysisSummary,
} from "src/aggregator/chains";
import { WebhookAlertDto } from "src/checkly/alertDTO";
import { prisma } from "src/prisma";
import { Prisma } from "@prisma/client";

export async function GET() {
	return NextResponse.json({ message: "Hello from Next.js!" });
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const alertDto = plainToInstance(WebhookAlertDto, body, {
			enableImplicitConversion: true,
		});

		// Validate the DTO
		await validateOrReject(alertDto);

		const aggregator = new CheckContextAggregator(alertDto);
		const context = await aggregator.aggregate();
		const contextAnalysis = await generateContextAnalysis(context);
		const summary = await generateContextAnalysisSummary(contextAnalysis);

		await prisma.alert
			.create({
				data: {
					data: { ...alertDto } as unknown as Prisma.InputJsonValue,
					context: JSON.stringify(contextAnalysis),
					summary,
				},
			})
			.catch((error) => {
				console.error("Error saving alert to the database:", error);
				return NextResponse.json(
					{ message: "Error saving alert to the database" },
					{ status: 500 }
				);
			});

		return NextResponse.json({ message: "OK" });
	} catch (error) {
		console.error("Error parsing or validating request body:", error);
		return NextResponse.json(
			{ message: "Invalid request body" },
			{ status: 400 }
		);
	}
}
