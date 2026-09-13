import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/ciphers/utils.js";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const DEVICE_KEY = "mwanamke.device-key.v1";

async function getOrCreateDeviceKey(): Promise<Uint8Array> {
  const hardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (!hardware || !enrolled || level !== LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG) throw new Error("A strong biometric lock is required to access private records.");
  const auth = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock MWANAMKE private records", biometricsSecurityLevel: "strong", disableDeviceFallback: true });
  if (!auth.success) throw new Error("Private records remain locked.");
  const existing = await SecureStore.getItemAsync(DEVICE_KEY, { requireAuthentication: true, authenticationPrompt: "Unlock MWANAMKE private records" });
  if (existing) return hexToBytes(existing);
  const key = await Crypto.getRandomBytesAsync(32);
  await SecureStore.setItemAsync(DEVICE_KEY, bytesToHex(key), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: true,
    authenticationPrompt: "Unlock MWANAMKE private records"
  });
  return key;
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
