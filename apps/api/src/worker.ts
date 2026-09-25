import { DisabledNotificationAdapter, DisabledPaymentAdapter, MockNotificationAdapter, MockPaymentAdapter } from "./adapters.js";
import { loadRuntimeConfig } from "./config.js";
import { runOutboxLoop } from "./outbox-worker.js";
import { createApplicationStore } from "./store.js";

const configuration = loadRuntimeConfig();
if (configuration.adapters.payment === "configured" || configuration.adapters.notification === "configured") {
  throw new Error("Configured production partner adapters must be injected by the deployment composition root.");
}

const store = createApplicationStore(configuration);
const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  const payment = configuration.adapters.payment === "disabled" ? new DisabledPaymentAdapter() : new MockPaymentAdapter();
  const notifications = configuration.adapters.notification === "disabled" ? new DisabledNotificationAdapter() : new MockNotificationAdapter();
  await runOutboxLoop(store, configuration, payment, notifications, controller.signal);
} finally {
  await store.close();
}
