import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

import { decryptFromStorage, encryptForSync, type MobileEncryptedEnvelope } from "@/lib/vault";
import { validProfile, type DailyCheckIn, type PatientHealthVault } from "@/lib/patient-health";

const STORAGE_PREFIX = "mwanamke.patient-health.v1";
const RECORD_TYPE = "patient-health-vault";

async function storageKey(scope: string) {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, scope);
  return `${STORAGE_PREFIX}.${digest}`;
}

function validCheckIn(value: unknown): value is DailyCheckIn {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DailyCheckIn>;
  return /^\d{4}-\d{2}-\d{2}$/.test(item.date ?? "")
    && ["none", "light", "medium", "heavy"].includes(item.flow ?? "")
    && ["low", "steady", "good", "great"].includes(item.mood ?? "")
    && Array.isArray(item.symptoms)
    && item.symptoms.every((entry) => typeof entry === "string" && entry.length <= 40);
}

export async function loadPatientHealth(scope: string): Promise<PatientHealthVault> {
  const scopedKey = await storageKey(scope);
  const raw = await AsyncStorage.getItem(scopedKey);
  if (!raw) return { version: 1, checkIns: [] };
  const envelope = JSON.parse(raw) as MobileEncryptedEnvelope;
  if (envelope.recordType !== `${RECORD_TYPE}:${scopedKey}`) throw new Error("Private record type mismatch.");
  const value = await decryptFromStorage<PatientHealthVault>(envelope);
  if (value.version !== 1) throw new Error("Unsupported patient record version.");
  return {
    version: 1,
    ...(value.profile && validProfile(value.profile) ? { profile: value.profile } : {}),
    checkIns: Array.isArray(value.checkIns) ? value.checkIns.filter(validCheckIn).slice(-120) : []
  };
}

export async function savePatientHealth(scope: string, value: PatientHealthVault) {
  const normalized: PatientHealthVault = { ...value, version: 1, checkIns: value.checkIns.slice(-120) };
  const scopedKey = await storageKey(scope);
  const envelope = await encryptForSync(`${RECORD_TYPE}:${scopedKey}`, normalized);
  await AsyncStorage.setItem(scopedKey, JSON.stringify(envelope));
}

export async function clearPatientHealth(scope: string) {
  await AsyncStorage.removeItem(await storageKey(scope));
}
