import "dotenv/config";
import { app } from "./app";

app.error(async (error) => {
  // Check the details of the error to handle cases where you should retry sending a message or stop the app
  console.error(error);
});

(async () => {
  await app.start();
  console.log("⚡️ Bolt app is running!");
})();
