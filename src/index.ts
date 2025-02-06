import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { getOpenaiClient } from "./ai/openai";
import { getRunMessages } from "./ai/utils";
import checklyWebhookRouter from "./routes/checklywebhook";
import githubWebhookRouter from "./routes/githubwebhook";
import { app as slackApp } from "./slackbot/app";
import { SreAssistant } from "./sre-assistant/SreAssistant";
import { startLangfuseTelemetrySDK } from "./langfuse";

process
  .on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
  })
  .on("uncaughtException", (error) => {
    console.error("Uncaught Exception thrown", error);
  });

// configures dotenv to work in your application
dotenv.config();
const app = express();

// Start the OpenTelemetry SDK to collect traces in Langfuse
if (process.env.ENABLE_LANGFUSE_TELEMETRY === "true") {
  startLangfuseTelemetrySDK();
}

const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Use the Checkly Webhook router
app.use("/checkly-webhook", checklyWebhookRouter);
app.use("/github-webhook", githubWebhookRouter);

app.get("/", (request: Request, response: Response) => {
  response.status(200).send("Hello World");
});

app.post("/test/:alertId", async (req: Request, res: Response) => {
  const { alertId } = req.params;
  const thread = await getOpenaiClient().beta.threads.create();
  const assistant = new SreAssistant(thread.id, alertId, {
    username: "Test User",
    date: new Date().toISOString(),
  });
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
  console.log("⚡️ Bolt app is running!");
})();
