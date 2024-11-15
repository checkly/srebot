import { NextResponse, NextRequest } from "next/server";
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { WebhookAlertDto } from '../../../../../checkly/alertDTO';

export async function GET() {
	return NextResponse.json({ message: "Hello from Next.js!" });
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const alertDto = plainToInstance(WebhookAlertDto, body, { enableImplicitConversion: true });
	
		// Validate the DTO
		await validateOrReject(alertDto);
	
		console.log(alertDto); // You can now use the parsed and validated AlertDto object
	
		// Do something with the alertDto, e.g., save to database, process, etc.
	
		return NextResponse.json({ message: "OK" });
	  } catch (error) {
		console.error("Error parsing or validating request body:", error);
		return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
	  }
}
