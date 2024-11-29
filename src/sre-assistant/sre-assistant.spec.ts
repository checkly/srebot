import dotenv from "dotenv";
import { SreAssistant } from "./SreAssistant";
import { getRunMessages } from "../ai/utils";
import OpenAI from "openai";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

jest.setTimeout(120000); // Set timeout to 120 seconds

describe.skip("SreAssistant Tests", () => {
	let openai;

	beforeAll(() => {
		console.log("OPENAI_API_KEY", OPENAI_API_KEY);

		openai = new OpenAI({
			apiKey: OPENAI_API_KEY,
		});
	});

	it("should handle a user message and respond", async () => {
		const alertId = "test";
		const thread = await openai.beta.threads.create();
		const assistant = new SreAssistant(thread.id, alertId, {
			username: "Test User",
			date: new Date().toISOString(),
		});
		const userMessage = await assistant.addMessage("Hi");
		const responseMessages = await assistant
			.runSync()
			.then((run) => getRunMessages(thread.id, run.id));

		console.log("Assistant response: ", responseMessages);

		expect(responseMessages.length).toBeGreaterThan(0);
	});
});
