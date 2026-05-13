import { registerOTel } from "@vercel/otel";
import { defineInstrumentation } from "experimental-ash/instrumentation";

export default defineInstrumentation({
  setup: ({ agentName }) =>
    registerOTel({
      serviceName: agentName,
    }),
});
