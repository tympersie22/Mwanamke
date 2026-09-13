export type EncryptedKeyEnvelope = {
  algorithm: "AES-256-GCM";
  keyId: string;
  wrappedKey: string;
  nonce: string;
};

export type EncryptedRecord = {
  version: 1;
  algorithm: "AES-256-GCM";
  recordId: string;
  recordType: string;
  ciphertext: string;
  nonce: string;
  envelope: EncryptedKeyEnvelope;
  createdAt: string;
};

export type RecipientSharingPackage = {
  version: 1;
  algorithm: "ECDH-P256+HKDF-SHA256+AES-256-GCM";
  ephemeralPublicKey: JsonWebKey;
  salt: string;
  nonce: string;
  ciphertext: string;
  purposeCode: string;
  expiresAt: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return new Uint8Array(Buffer.from(value, "base64"));
}

function randomId(prefix: string): string {
  return `${prefix}_${bytesToBase64(crypto.getRandomValues(new Uint8Array(12))).replace(/[+/=]/g, "").slice(0, 16)}`;
}

export async function generateDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt", "wrapKey", "unwrapKey"]);
}

export async function exportRecoveryKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  const base64 = bytesToBase64(new Uint8Array(raw));
  return base64.match(/.{1,4}/g)?.join("-") ?? base64;
}

export async function importRecoveryKey(recoveryKey: string): Promise<CryptoKey> {
  const raw = base64ToBytes(recoveryKey.replaceAll("-", ""));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt", "wrapKey", "unwrapKey"]);
}

export async function encryptSensitiveRecord(
  payload: unknown,
  deviceKey: CryptoKey,
  recordType: string,
  recordId = randomId("rec")
): Promise<EncryptedRecord> {
  const dataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const dataNonce = crypto.getRandomValues(new Uint8Array(12));
  const wrapNonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(`mwanamke:v1:${recordType}:${recordId}`);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: dataNonce, additionalData: aad },
    dataKey,
    encoder.encode(JSON.stringify(payload))
  );
  const wrappedKey = await crypto.subtle.wrapKey("raw", dataKey, deviceKey, { name: "AES-GCM", iv: wrapNonce });
  return {
    version: 1,
    algorithm: "AES-256-GCM",
    recordId,
    recordType,
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    nonce: bytesToBase64(dataNonce),
    envelope: {
      algorithm: "AES-256-GCM",
      keyId: randomId("device"),
      wrappedKey: bytesToBase64(new Uint8Array(wrappedKey)),
      nonce: bytesToBase64(wrapNonce)
    },
    createdAt: new Date().toISOString()
  };
}

export async function decryptSensitiveRecord<T>(record: EncryptedRecord, deviceKey: CryptoKey): Promise<T> {
  const dataKey = await crypto.subtle.unwrapKey(
    "raw",
    base64ToBytes(record.envelope.wrappedKey),
    deviceKey,
    { name: "AES-GCM", iv: base64ToBytes(record.envelope.nonce) },
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const aad = encoder.encode(`mwanamke:v1:${record.recordType}:${record.recordId}`);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(record.nonce), additionalData: aad },
    dataKey,
    base64ToBytes(record.ciphertext)
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function decodedBase64Length(value: unknown, minimum: number, maximum: number): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > Math.ceil(maximum / 3) * 4 + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  try {
    const length = base64ToBytes(value).length;
    return length >= minimum && length <= maximum;
  } catch {
    return false;
  }
}

export function isCiphertextEnvelope(value: unknown): value is EncryptedRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<EncryptedRecord>;
  if (!hasOnlyKeys(value, ["version", "algorithm", "recordId", "recordType", "ciphertext", "nonce", "envelope", "createdAt"])) return false;
  if (typeof candidate.envelope !== "object" || candidate.envelope === null || !hasOnlyKeys(candidate.envelope, ["algorithm", "keyId", "wrappedKey", "nonce"])) return false;
  return candidate.version === 1 && candidate.algorithm === "AES-256-GCM" &&
    candidate.envelope.algorithm === "AES-256-GCM" &&
    typeof candidate.recordId === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(candidate.recordId) &&
    typeof candidate.recordType === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(candidate.recordType) &&
    typeof candidate.envelope.keyId === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(candidate.envelope.keyId) &&
    decodedBase64Length(candidate.ciphertext, 17, 524_304) &&
    decodedBase64Length(candidate.nonce, 12, 12) &&
    decodedBase64Length(candidate.envelope.wrappedKey, 48, 48) &&
    decodedBase64Length(candidate.envelope.nonce, 12, 12) &&
    typeof candidate.createdAt === "string" && Number.isFinite(Date.parse(candidate.createdAt));
}

export function neutralNotificationPayload(eventId: string): { title: string; body: string; data: { eventId: string } } {
  return {
    title: "MWANAMKE",
    body: "You have an update waiting.",
    data: { eventId }
  };
}

export async function generateSharingIdentity(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
}

export async function exportSharingPublicKey(publicKey: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", publicKey);
}

async function deriveSharingKey(privateKey: CryptoKey, publicKey: CryptoKey, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const sharedSecret = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode("mwanamke:provider-sharing:v1") },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSharingPackage(
  selectedRecords: unknown,
  recipientPublicJwk: JsonWebKey,
  purposeCode: string,
  expiresAt: string
): Promise<RecipientSharingPackage> {
  const recipientPublicKey = await crypto.subtle.importKey("jwk", recipientPublicJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ephemeral = await generateSharingIdentity();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sharingKey = await deriveSharingKey(ephemeral.privateKey, recipientPublicKey, salt);
  const aad = encoder.encode(`mwanamke:share:v1:${purposeCode}:${expiresAt}`);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad },
    sharingKey,
    encoder.encode(JSON.stringify(selectedRecords))
  );
  return {
    version: 1,
    algorithm: "ECDH-P256+HKDF-SHA256+AES-256-GCM",
    ephemeralPublicKey: await exportSharingPublicKey(ephemeral.publicKey),
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    purposeCode,
    expiresAt
  };
}

export async function decryptSharingPackage<T>(sharingPackage: RecipientSharingPackage, recipientPrivateKey: CryptoKey): Promise<T> {
  const ephemeralPublicKey = await crypto.subtle.importKey("jwk", sharingPackage.ephemeralPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharingKey = await deriveSharingKey(recipientPrivateKey, ephemeralPublicKey, base64ToBytes(sharingPackage.salt));
  const aad = encoder.encode(`mwanamke:share:v1:${sharingPackage.purposeCode}:${sharingPackage.expiresAt}`);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(sharingPackage.nonce), additionalData: aad },
    sharingKey,
    base64ToBytes(sharingPackage.ciphertext)
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}
