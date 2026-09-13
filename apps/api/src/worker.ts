import { MockNotificationAdapter, MockPaymentAdapter } from "./adapters.js";
import { loadRuntimeConfig } from "./config.js";
import { runOutboxLoop } from "./outbox-worker.js";
import { createApplicationStore } from "./store.js";

const configuration = loadRuntimeConfig();
if (configuration.adapters.payment !== "mock" || configuration.adapters.notification !== "mock") {
  throw new Error("Configured production partner adapters must be injected by the deployment composition root.");
}

const store = createApplicationStore(configuration);
const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  await runOutboxLoop(store, configuration, new MockPaymentAdapter(), new MockNotificationAdapter(), controller.signal);
} finally {
  await store.close();
}
