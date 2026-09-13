import { z } from "zod";
import type { NotificationAdapter, PaymentAdapter } from "./adapters.js";
import type { RuntimeConfig } from "./config.js";
import type { ApplicationStore, OutboxItem } from "./store.js";

const paymentPayload = z.object({
  paymentId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  amountTzs: z.number().int().positive(),
  method: z.enum(["mpesa", "mixx", "airtel", "halopesa", "card", "sponsor"]),
  idempotencyKey: z.string().min(8).max(80)
});
const notificationPayload = z.object({ deviceId: z.string().uuid(), eventId: z.string().uuid() });
const auditPayload = z.object({ auditEventId: z.string().uuid(), eventHash: z.string().min(40).max(128), actorRef: z.string().max(200), action: z.string().max(120), targetRef: z.string().max(200).nullable(), occurredAt: z.string().datetime(), previousHash: z.string().max(128).nullable() });

function retryDelay(attempts: number): number {
  return Math.min(300_000, 1_000 * 2 ** Math.min(attempts, 8));
}

async function deliver(item: OutboxItem, store: ApplicationStore, configuration: RuntimeConfig, paymentAdapter: PaymentAdapter, notificationAdapter: NotificationAdapter): Promise<void> {
  try {
    if (item.topic === "payment.reserve") {
      const payload = paymentPayload.parse(item.payload);
      if (!await store.paymentEventDeliverable(payload.paymentId)) {
        await store.completePaymentEvent(configuration.outbox.workerId, item.id, payload.paymentId, { status: "failed", retryable: false, adapterReference: `not-dispatched:${payload.paymentId}` });
        return;
      }
      const result = await paymentAdapter.reserve(payload);
      if (result.status === "failed" && result.retryable) throw new Error("PAYMENT_RETRYABLE_FAILURE");
      await store.completePaymentEvent(configuration.outbox.workerId, item.id, payload.paymentId, result);
      return;
    }
    if (item.topic === "notification.send-neutral") {
      const payload = notificationPayload.parse(item.payload);
      const result = await notificationAdapter.sendNeutralUpdate(payload.deviceId, payload.eventId);
      if (!result.queued) throw new Error("NOTIFICATION_NOT_ACCEPTED");
      await store.completeOutboxEvent(configuration.outbox.workerId, item.id);
      return;
    }
    if (item.topic === "audit.export") {
      const payload = auditPayload.parse(item.payload);
      if (!configuration.auditSinkUrl || !configuration.auditSinkToken) {
        if (configuration.nodeEnv === "production") throw new Error("AUDIT_SINK_NOT_CONFIGURED");
        await store.completeOutboxEvent(configuration.outbox.workerId, item.id);
        return;
      }
      const response = await fetch(configuration.auditSinkUrl, { method: "POST", headers: { Authorization: `Bearer ${configuration.auditSinkToken}`, "Content-Type": "application/json", "Idempotency-Key": payload.auditEventId }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`AUDIT_SINK_${response.status}`);
      await store.completeOutboxEvent(configuration.outbox.workerId, item.id);
      return;
    }
    if (["appointment.held", "appointment.expired", "appointment.cancelled", "appointment.confirmed"].includes(item.topic)) {
      await store.completeOutboxEvent(configuration.outbox.workerId, item.id);
      return;
    }
    await store.retryOutboxEvent(configuration.outbox.workerId, item.id, "UNKNOWN_TOPIC", 0, true);
  } catch (error) {
    const terminal = item.attempts >= configuration.outbox.maxAttempts;
    const errorCode = error instanceof z.ZodError ? "INVALID_OUTBOX_PAYLOAD" : error instanceof Error && error.message === "PAYMENT_RETRYABLE_FAILURE" ? error.message : "ADAPTER_DELIVERY_FAILED";
    await store.retryOutboxEvent(configuration.outbox.workerId, item.id, errorCode, retryDelay(item.attempts), terminal || errorCode === "INVALID_OUTBOX_PAYLOAD");
  }
}

export async function runOutboxBatch(store: ApplicationStore, configuration: RuntimeConfig, paymentAdapter: PaymentAdapter, notificationAdapter: NotificationAdapter, batchSize = 20): Promise<number> {
  await store.expireHolds();
  const items = await store.claimOutbox(configuration.outbox.workerId, batchSize);
  await Promise.all(items.map((item) => deliver(item, store, configuration, paymentAdapter, notificationAdapter)));
  return items.length;
}

export async function runOutboxLoop(store: ApplicationStore, configuration: RuntimeConfig, paymentAdapter: PaymentAdapter, notificationAdapter: NotificationAdapter, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    const delivered = await runOutboxBatch(store, configuration, paymentAdapter, notificationAdapter);
    if (delivered > 0) continue;
    await new Promise<void>((resolve) => {
      const finish = () => { clearTimeout(timeout); signal.removeEventListener("abort", finish); resolve(); };
      const timeout = setTimeout(finish, configuration.outbox.pollMs);
      signal.addEventListener("abort", finish, { once: true });
      if (signal.aborted) finish();
    });
  }
}
