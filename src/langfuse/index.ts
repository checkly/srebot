import { Langfuse } from "langfuse";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseExporter } from "langfuse-vercel";
import dotenv from "dotenv";

dotenv.config();

export const langfuse = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: process.env.LANGFUSE_BASEURL,
});

export const telemetrySDK = new NodeSDK({
  traceExporter: new LangfuseExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

export const startLangfuseTelemetrySDK = () => {
  if (
    process.env.LANGFUSE_SECRET_KEY &&
    process.env.LANGFUSE_BASEURL &&
    process.env.LANGFUSE_PUBLIC_KEY
  ) {
    telemetrySDK.start();
  } else {
    console.warn(
      "LANGFUSE_SECRET_KEY, LANGFUSE_BASEURL and LANGFUSE_PUBLIC_KEY are not set. Langfuse observability will not be available."
    );
  }
};
