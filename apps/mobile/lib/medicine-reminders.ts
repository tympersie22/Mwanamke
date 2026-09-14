import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export type ReminderAction = "taken" | "skipped";

export type MedicineReminder = {
  id: string;
  name: string;
  dose: string;
  time: string;
  enabled: boolean;
  notificationId?: string;
  lastAction?: { date: string; action: ReminderAction };
};

const STORAGE_PREFIX = "mwanamke.medicine-reminders.v1";
const NOTIFICATION_CHANNEL = "care-reminders";

async function storageKey(scope: string) {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, scope);
  return `${STORAGE_PREFIX}.${digest}`;
}

function isReminder(value: unknown): value is MedicineReminder {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MedicineReminder>;
  return typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && typeof candidate.dose === "string"
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.time ?? "")
    && typeof candidate.enabled === "boolean";
}

export async function loadMedicineReminders(scope: string): Promise<MedicineReminder[]> {
  const raw = await SecureStore.getItemAsync(await storageKey(scope));
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter(isReminder) : [];
}

export async function saveMedicineReminders(scope: string, reminders: MedicineReminder[]) {
  await SecureStore.setItemAsync(await storageKey(scope), JSON.stringify(reminders), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
}

function notificationsAllowed(settings: Notifications.NotificationPermissionsStatus) {
  return settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function scheduleNeutralDailyReminder(time: string, language: "sw" | "en") {
  let permission = await Notifications.getPermissionsAsync();
  if (!notificationsAllowed(permission)) {
    permission = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true }
    });
  }
  if (!notificationsAllowed(permission)) return undefined;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL, {
      name: language === "sw" ? "Vikumbusho vya huduma" : "Care reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      sound: "default"
    });
  }

  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "MWANAMKE",
      body: language === "sw" ? "Una kikumbusho cha huduma kinachokusubiri." : "You have a care reminder waiting.",
      sound: "default",
      data: { kind: "care-reminder" }
    },
    trigger: Platform.OS === "android"
      ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: NOTIFICATION_CHANNEL }
      : { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute }
  });
}

export async function cancelMedicineNotification(notificationId?: string) {
  if (!notificationId) return;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
