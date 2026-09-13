import { describe, expect, it } from "vitest";
import { decryptSensitiveRecord, decryptSharingPackage, encryptSensitiveRecord, encryptSharingPackage, exportSharingPublicKey, generateDeviceKey, generateSharingIdentity, isCiphertextEnvelope, neutralNotificationPayload } from "../src/index";

describe("zero-knowledge record envelope", () => {
  it("allows the client key — and only that key — to decrypt", async () => {
    const deviceKey = await generateDeviceKey();
    const wrongKey = await generateDeviceKey();
    const sensitive = { symptom: "severe cramps", pregnancyWeek: 24, note: "private clinical detail" };
    const envelope = await encryptSensitiveRecord(sensitive, deviceKey, "health-record", "record-test-1");

    expect(isCiphertextEnvelope(envelope)).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain("severe cramps");
    expect(JSON.stringify(envelope)).not.toContain("pregnancyWeek");
    await expect(decryptSensitiveRecord(envelope, wrongKey)).rejects.toThrow();
    await expect(decryptSensitiveRecord(envelope, deviceKey)).resolves.toEqual(sensitive);
  });

  it("uses a fresh nonce and data key for each record", async () => {
    const key = await generateDeviceKey();
    const first = await encryptSensitiveRecord({ value: "same" }, key, "note");
    const second = await encryptSensitiveRecord({ value: "same" }, key, "note");
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.envelope.wrappedKey).not.toBe(second.envelope.wrappedKey);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects malformed, oversized and ambiguous ciphertext envelopes", async () => {
    const key = await generateDeviceKey();
    const envelope = await encryptSensitiveRecord({ value: "private" }, key, "note", "record-test-2");
    expect(isCiphertextEnvelope({ ...envelope, nonce: "not-base64" })).toBe(false);
    expect(isCiphertextEnvelope({ ...envelope, unexpected: "field" })).toBe(false);
    expect(isCiphertextEnvelope({ ...envelope, envelope: { ...envelope.envelope, nonce: btoa("short") } })).toBe(false);
    expect(isCiphertextEnvelope({ ...envelope, recordType: "../../unsafe" })).toBe(false);
  });

  it("never includes sensitive detail in push payloads", () => {
    const payload = neutralNotificationPayload("evt-1");
    expect(payload.body).toBe("You have an update waiting.");
    expect(JSON.stringify(payload)).not.toMatch(/pregnan|period|clinic|result|prescription/i);
  });

  it("encrypts consented records to the verified provider public key", async () => {
    const provider = await generateSharingIdentity();
    const unrelatedProvider = await generateSharingIdentity();
    const expiresAt = "2026-09-06T12:00:00.000Z";
    const sharingPackage = await encryptSharingPackage(
      { selectedRecordIds: ["rec-1"], result: "private result" },
      await exportSharingPublicKey(provider.publicKey),
      "FOLLOW_UP",
      expiresAt
    );
    expect(JSON.stringify(sharingPackage)).not.toContain("private result");
    await expect(decryptSharingPackage(sharingPackage, unrelatedProvider.privateKey)).rejects.toThrow();
    await expect(decryptSharingPackage(sharingPackage, provider.privateKey)).resolves.toEqual({ selectedRecordIds: ["rec-1"], result: "private result" });
  });
});
