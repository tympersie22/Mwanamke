import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from "@noble/ciphers/utils.js";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const DEVICE_KEY = "mwanamke.device-key.v1";
let unlockedDeviceKey: Uint8Array | undefined;

async function getOrCreateDeviceKey(): Promise<Uint8Array> {
  if (unlockedDeviceKey) return unlockedDeviceKey;
  const hardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (!hardware || !enrolled || level !== LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG) throw new Error("A strong biometric lock is required to access private records.");
  const auth = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock MWANAMKE private records", biometricsSecurityLevel: "strong", disableDeviceFallback: true });
  if (!auth.success) throw new Error("Private records remain locked.");
  const existing = await SecureStore.getItemAsync(DEVICE_KEY, { requireAuthentication: true, authenticationPrompt: "Unlock MWANAMKE private records" });
  if (existing) {
    unlockedDeviceKey = hexToBytes(existing);
    return unlockedDeviceKey;
  }
  const key = await Crypto.getRandomBytesAsync(32);
  await SecureStore.setItemAsync(DEVICE_KEY, bytesToHex(key), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: true,
    authenticationPrompt: "Unlock MWANAMKE private records"
  });
  unlockedDeviceKey = key;
  return unlockedDeviceKey;
}

export function lockPrivateVault() {
  unlockedDeviceKey = undefined;
}

export type MobileEncryptedEnvelope = {
  version: 1;
  algorithm: "XChaCha20-Poly1305";
  nonce: string;
  ciphertext: string;
  recordType: string;
};

export async function encryptForSync(recordType: string, value: unknown): Promise<MobileEncryptedEnvelope> {
  const key = await getOrCreateDeviceKey();
  const nonce = await Crypto.getRandomBytesAsync(24);
  const aad = utf8ToBytes(`mwanamke:mobile:v1:${recordType}`);
  const cipher = xchacha20poly1305(key, nonce, aad);
  const ciphertext = cipher.encrypt(utf8ToBytes(JSON.stringify(value)));
  return { version: 1, algorithm: "XChaCha20-Poly1305", nonce: bytesToHex(nonce), ciphertext: bytesToHex(ciphertext), recordType };
}

export async function decryptFromStorage<T>(envelope: MobileEncryptedEnvelope): Promise<T> {
  if (envelope.version !== 1 || envelope.algorithm !== "XChaCha20-Poly1305") throw new Error("Unsupported private record format.");
  const key = await getOrCreateDeviceKey();
  const aad = utf8ToBytes(`mwanamke:mobile:v1:${envelope.recordType}`);
  const cipher = xchacha20poly1305(key, hexToBytes(envelope.nonce), aad);
  const plaintext = cipher.decrypt(hexToBytes(envelope.ciphertext));
  return JSON.parse(bytesToUtf8(plaintext)) as T;
}
