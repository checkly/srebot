import express, { Request, Response } from "express";
import dotenv from "dotenv";
import checklyWebhookRouter from "./routes/checklywebhook";
import { SreAssistant } from "./sre-assistant/SreAssistant";
import { getOpenaiClient } from "./ai/openai";
import { getRunMessages } from "./ai/utils";
import { slackApp:app } from "./slackbot/app";

// configures dotenv to work in your application
dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Use the Checkly Webhook router
app.use("/checkly-webhook", checklyWebhookRouter);

app.get("/", (request: Request, response: Response) => {
	response.status(200).send("Hello World");
});

app.post("/test/:alertId", async (req: Request, res: Response) => {
	const { alertId } = req.params;
	const thread = await getOpenaiClient().beta.threads.create();
	const assistant = new SreAssistant(thread.id, alertId);
	const userMessage = await assistant.addMessage(req.body.message);
	const responseMessages = await assistant
		.runSync()
		.then((run) => getRunMessages(thread.id, run.id));

	console.log("Assistant response: ", responseMessages);

	res.status(200).send(responseMessages);
});

app
	.listen(PORT, () => {
		console.log("Server running at PORT: ", PORT);
	})
	.on("error", (error) => {
		// gracefully handle error
		throw new Error(error.message);
	});

  //run slack app
  slackApp.error(async (error) => {
    // Check the details of the error to handle cases where you should retry sending a message or stop the app
    console.error(error);
  });
  
  (async () => {
    await slackApp.start();
    console.log('⚡️ Bolt app is running!');
  })();
  

