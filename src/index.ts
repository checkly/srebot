import express, { Request, Response } from "express";
import dotenv from "dotenv";
import checklyWebhookRouter from './routes/checklywebhook';

// configures dotenv to work in your application
dotenv.config();
const app = express();

const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Use the Checkly Webhook router
app.use('/checkly-webhook', checklyWebhookRouter);

app.get("/", (request: Request, response: Response) => { 
  response.status(200).send("Hello World");
}); 

app.listen(PORT, () => { 
  console.log("Server running at PORT: ", PORT); 
}).on("error", (error) => {
  // gracefully handle error
  throw new Error(error.message);
});