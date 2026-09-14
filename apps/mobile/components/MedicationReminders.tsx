import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import {
  cancelMedicineNotification,
  loadMedicineReminders,
  type MedicineReminder,
  type ReminderAction,
  saveMedicineReminders,
  scheduleNeutralDailyReminder
} from "@/lib/medicine-reminders";

type Language = "sw" | "en";

export type MedicineReminderController = {
  reminders: MedicineReminder[];
  loading: boolean;
  storageError: boolean;
  add: (input: { name: string; dose: string; time: string }) => Promise<boolean>;
  mark: (id: string, action: ReminderAction) => void;
  clearAction: (id: string) => void;
  toggle: (id: string) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
};

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function previewReminders(): MedicineReminder[] {
  return [
    { id: "demo-morning", name: "Morning supplement", dose: "1 tablet", time: "08:00", enabled: true, lastAction: { date: todayKey(), action: "taken" } },
    { id: "demo-evening", name: "Evening medicine", dose: "1 tablet", time: "20:00", enabled: true }
  ];
}

export function useMedicineReminders({ language, storageScope, preview }: { language: Language; storageScope: string; preview: boolean }): MedicineReminderController {
  const [reminders, setReminders] = useState<MedicineReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setHydrated(false);
    void loadMedicineReminders(storageScope)
      .then((stored) => {
        if (!active) return;
        setReminders(stored.length > 0 ? stored : preview ? previewReminders() : []);
        setStorageError(false);
      })
      .catch(() => {
        if (!active) return;
        setReminders(preview ? previewReminders() : []);
        setStorageError(true);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setHydrated(true);
      });
    return () => { active = false; };
  }, [preview, storageScope]);

  useEffect(() => {
    if (!hydrated) return;
    void saveMedicineReminders(storageScope, reminders)
      .then(() => setStorageError(false))
      .catch(() => setStorageError(true));
  }, [hydrated, reminders, storageScope]);

  const add = useCallback(async ({ name, dose, time }: { name: string; dose: string; time: string }) => {
    let notificationId: string | undefined;
    try {
      notificationId = await scheduleNeutralDailyReminder(time, language);
    } catch {
      notificationId = undefined;
    }
    setReminders((current) => [...current, {
      id: Crypto.randomUUID(),
      name: name.trim(),
      dose: dose.trim(),
      time,
      enabled: true,
      ...(notificationId ? { notificationId } : {})
    }].sort((a, b) => a.time.localeCompare(b.time)));
    return Boolean(notificationId);
  }, [language]);

  const mark = useCallback((id: string, action: ReminderAction) => {
    setReminders((current) => current.map((reminder) => reminder.id === id
      ? { ...reminder, lastAction: { date: todayKey(), action } }
      : reminder));
  }, []);

  const clearAction = useCallback((id: string) => {
    setReminders((current) => current.map((reminder) => {
      if (reminder.id !== id) return reminder;
      const { lastAction: _lastAction, ...withoutAction } = reminder;
      return withoutAction;
    }));
  }, []);

  const toggle = useCallback(async (id: string) => {
    const reminder = reminders.find((item) => item.id === id);
    if (!reminder) return false;
    if (reminder.enabled) {
      await cancelMedicineNotification(reminder.notificationId).catch(() => undefined);
      setReminders((current) => current.map((item) => {
        if (item.id !== id) return item;
        const { notificationId: _notificationId, ...withoutNotification } = item;
        return { ...withoutNotification, enabled: false };
      }));
      return false;
    }
    let notificationId: string | undefined;
    try {
      notificationId = await scheduleNeutralDailyReminder(reminder.time, language);
    } catch {
      notificationId = undefined;
    }
    setReminders((current) => current.map((item) => item.id === id
      ? { ...item, enabled: true, ...(notificationId ? { notificationId } : {}) }
      : item));
    return Boolean(notificationId);
  }, [language, reminders]);

  const remove = useCallback(async (id: string) => {
    const reminder = reminders.find((item) => item.id === id);
    await cancelMedicineNotification(reminder?.notificationId).catch(() => undefined);
    setReminders((current) => current.filter((item) => item.id !== id));
  }, [reminders]);

  return { reminders, loading, storageError, add, mark, clearAction, toggle, remove };
}

function displayName(reminder: MedicineReminder, language: Language) {
  if (reminder.id === "demo-morning") return language === "sw" ? "Kirutubisho cha asubuhi" : "Morning supplement";
  if (reminder.id === "demo-evening") return language === "sw" ? "Dawa ya jioni" : "Evening medicine";
  return reminder.name;
}

function displayDose(reminder: MedicineReminder, language: Language) {
  if (reminder.id.startsWith("demo-")) return language === "sw" ? "Kidonge 1" : "1 tablet";
  return reminder.dose;
}

function statusFor(reminder: MedicineReminder) {
  if (!reminder.enabled) return "paused" as const;
  if (reminder.lastAction?.date === todayKey()) return reminder.lastAction.action;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [hour = 0, minute = 0] = reminder.time.split(":").map(Number);
  return hour * 60 + minute < current ? "overdue" as const : "upcoming" as const;
}

function MedicineRow({ reminder, language, onMark, compact = false }: { reminder: MedicineReminder; language: Language; onMark: (action: ReminderAction) => void; compact?: boolean }) {
  const t = (sw: string, en: string) => language === "sw" ? sw : en;
  const status = statusFor(reminder);
  const done = status === "taken";
  const skipped = status === "skipped";
  const statusLabel = status === "taken" ? t("Imetumika", "Taken")
    : status === "skipped" ? t("Imerukwa", "Skipped")
      : status === "overdue" ? t("Imechelewa", "Overdue")
        : status === "paused" ? t("Imesitishwa", "Paused")
          : t("Inakuja", "Upcoming");

  return <View style={[styles.medicineRow, compact && styles.medicineRowCompact, !reminder.enabled && styles.rowMuted]}>
    <View style={[styles.pillIcon, done && styles.pillIconDone]}><Text style={[styles.pillGlyph, done && styles.pillGlyphDone]}>{done ? "✓" : "●"}</Text></View>
    <View style={styles.flex}>
      <View style={styles.rowTop}><Text numberOfLines={1} style={[styles.medicineName, compact && styles.medicineNameCompact]}>{displayName(reminder, language)}</Text><Text style={[styles.time, compact && styles.timeCompact]}>{reminder.time}</Text></View>
      <Text style={[styles.dose, compact && styles.doseCompact]}>{displayDose(reminder, language) || t("Kipimo hakijawekwa", "Dose not entered")} · <Text style={[styles.status, compact && styles.statusCompact, status === "overdue" && (compact ? styles.statusOverdueCompact : styles.statusOverdue)]}>{statusLabel}</Text></Text>
      {!compact && reminder.enabled && !done && !skipped ? <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => onMark("taken")} style={({ pressed }) => [styles.takenButton, pressed && styles.pressed]}><Text style={styles.takenButtonText}>✓  {t("Nimetumia", "Mark taken")}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => onMark("skipped")} style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}><Text style={styles.skipButtonText}>{t("Ruka", "Skip")}</Text></Pressable>
      </View> : null}
    </View>
  </View>;
}

export function MedicationSummaryCard({ language, controller, onOpen }: { language: Language; controller: MedicineReminderController; onOpen: () => void }) {
  const t = (sw: string, en: string) => language === "sw" ? sw : en;
  const enabled = useMemo(() => controller.reminders.filter((item) => item.enabled), [controller.reminders]);
  const taken = enabled.filter((item) => statusFor(item) === "taken").length;
  const next = enabled.find((item) => !["taken", "skipped"].includes(statusFor(item)));

  return <View style={styles.summaryCard}>
    <View style={styles.summaryHead}>
      <View style={styles.flex}><Text style={styles.summaryEyebrow}>{t("DAWA ZA LEO", "TODAY’S MEDICINES")}</Text><Text accessibilityRole="header" style={styles.summaryTitle}>{t("Ratiba ya dawa", "Medicine schedule")}</Text></View>
      {enabled.length > 0 ? <View style={styles.progressPill}><Text style={styles.progressText}>{taken}/{enabled.length}</Text></View> : null}
    </View>
    {controller.loading ? <ActivityIndicator accessibilityLabel={t("Inapakia vikumbusho", "Loading reminders")} color="#dcece5" /> : next ? <MedicineRow reminder={next} language={language} onMark={(action) => controller.mark(next.id, action)} /> : enabled.length > 0 ? <View style={styles.completeState}><Text style={styles.completeIcon}>✓</Text><View style={styles.flex}><Text style={styles.completeTitle}>{t("Ratiba ya leo imekamilika", "Today’s schedule is complete")}</Text><Text style={styles.completeText}>{t("Unaweza kurekebisha hali yoyote kwenye ratiba yote.", "You can correct any status in the full schedule.")}</Text></View></View> : <Text style={styles.summaryEmptyText}>{t("Huna kikumbusho cha dawa. Ongeza dawa au kirutubisho ulichoshauriwa kutumia.", "No medicine reminders yet. Add a medicine or supplement you have been advised to take.")}</Text>}
    <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.manageButton, pressed && styles.pressed]}><Text style={styles.manageButtonText}>{enabled.length ? t("Angalia ratiba yote", "View full schedule") : t("Ongeza kikumbusho", "Add a reminder")}  →</Text></Pressable>
  </View>;
}

export function MedicationRemindersScreen({ language, controller, onBack }: { language: Language; controller: MedicineReminderController; onBack: () => void }) {
  const t = (sw: string, en: string) => language === "sw" ? sw : en;
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [time, setTime] = useState("08:00");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const normalizedTime = time.trim();
    if (!name.trim()) {
      setError(t("Andika jina la dawa au kirutubisho.", "Enter the medicine or supplement name."));
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalizedTime)) {
      setError(t("Tumia saa katika mfumo wa saa 24, kwa mfano 08:30.", "Use 24-hour time, for example 08:30."));
      return;
    }
    setBusy(true);
    setError("");
    const scheduled = await controller.add({ name, dose, time: normalizedTime });
    setBusy(false);
    setName("");
    setDose("");
    setTime("08:00");
    setFormOpen(false);
    setNotice(scheduled
      ? t("Kikumbusho kimeongezwa. Arifa itaonyesha ujumbe wa faragha.", "Reminder added. The notification will use private wording.")
      : t("Kikumbusho kimeongezwa ndani ya programu. Washa arifa kwenye mipangilio ya kifaa ili upate taarifa.", "Reminder added in the app. Enable notifications in device settings to receive alerts."));
  };

  return <View style={styles.screen}>
    <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹  {t("Leo", "Today")}</Text></Pressable>
    <Text style={styles.eyebrow}>{t("HUDUMA YANGU", "MY CARE")}</Text>
    <Text accessibilityRole="header" style={styles.pageTitle}>{t("Vikumbusho vya dawa", "Medicine reminders")}</Text>
    <Text style={styles.lead}>{t("Panga dawa na virutubisho ulivyoelekezwa kutumia, kisha thibitisha kila kipimo.", "Schedule medicines and supplements you have been advised to take, then confirm each dose.")}</Text>

    <View style={styles.privacyNote}><Text style={styles.lock}>◇</Text><View style={styles.flex}><Text style={styles.privacyTitle}>{t("Arifa za faragha", "Private notifications")}</Text><Text style={styles.privacyText}>{t("Jina la dawa na kipimo havitaonekana kwenye skrini iliyofungwa.", "Medicine names and doses never appear on the lock screen.")}</Text></View></View>
    {controller.storageError ? <Text accessibilityRole="alert" style={styles.error}>{t("Mabadiliko hayakuweza kuhifadhiwa salama kwenye kifaa hiki.", "Changes could not be stored securely on this device.")}</Text> : null}

    <View style={styles.listCard}>
      <View style={styles.summaryHead}><View><Text style={styles.eyebrow}>{t("KILA SIKU", "EVERY DAY")}</Text><Text style={styles.title}>{t("Ratiba yangu", "My schedule")}</Text></View><Text style={styles.count}>{controller.reminders.length}</Text></View>
      {controller.loading ? <ActivityIndicator accessibilityLabel={t("Inapakia", "Loading")} color="#17665c" /> : controller.reminders.length === 0 ? <Text style={styles.emptyText}>{t("Hakuna vikumbusho bado.", "No reminders yet.")}</Text> : controller.reminders.map((reminder) => <View key={reminder.id} style={styles.manageRow}>
        <MedicineRow reminder={reminder} language={language} onMark={(action) => controller.mark(reminder.id, action)} compact />
        {reminder.enabled ? ["taken", "skipped"].includes(statusFor(reminder)) ? <Pressable accessibilityRole="button" onPress={() => controller.clearAction(reminder.id)} style={styles.undoButton}><Text style={styles.undoText}>{t("Rekebisha hali ya leo", "Correct today’s status")}</Text></Pressable> : <View style={styles.compactActions}><Pressable accessibilityRole="button" onPress={() => controller.mark(reminder.id, "taken")} style={styles.compactTakenButton}><Text style={styles.compactTakenText}>✓  {t("Nimetumia", "Taken")}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => controller.mark(reminder.id, "skipped")} style={styles.compactSkipButton}><Text style={styles.compactSkipText}>{t("Ruka", "Skip")}</Text></Pressable></View> : null}
        <View style={styles.manageActions}>
          <View style={styles.switchLabel}><Text style={styles.switchText}>{reminder.enabled ? t("Imewashwa", "On") : t("Imesitishwa", "Paused")}</Text><Switch accessibilityLabel={t(`Washa au sitisha ${displayName(reminder, language)}`, `Enable or pause ${displayName(reminder, language)}`)} value={reminder.enabled} onValueChange={() => void controller.toggle(reminder.id).then((scheduled) => {
            if (!reminder.enabled && !scheduled) setNotice(t("Kikumbusho kimewashwa ndani ya programu; arifa za kifaa bado zimezimwa.", "The in-app reminder is on; device notifications remain disabled."));
          })} trackColor={{ false: "#d8dedb", true: "#9cc8b7" }} thumbColor={reminder.enabled ? "#17665c" : "#71827d"} /></View>
          <Pressable accessibilityRole="button" onPress={() => void controller.remove(reminder.id)} style={styles.removeButton}><Text style={styles.removeText}>{t("Ondoa", "Remove")}</Text></Pressable>
        </View>
      </View>)}
    </View>

    {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {formOpen ? <View style={styles.formCard}>
      <Text accessibilityRole="header" style={styles.title}>{t("Ongeza kikumbusho", "Add a reminder")}</Text>
      <Text style={styles.label}>{t("Dawa au kirutubisho", "Medicine or supplement")}</Text>
      <TextInput accessibilityLabel={t("Jina la dawa au kirutubisho", "Medicine or supplement name")} autoCapitalize="sentences" value={name} onChangeText={setName} placeholder={t("Mfano: vitamini ya kila siku", "Example: daily vitamin")} placeholderTextColor="#84938e" style={styles.input} />
      <Text style={styles.label}>{t("Kipimo (si lazima)", "Dose (optional)")}</Text>
      <TextInput accessibilityLabel={t("Kipimo", "Dose")} value={dose} onChangeText={setDose} placeholder={t("Mfano: kidonge 1", "Example: 1 tablet")} placeholderTextColor="#84938e" style={styles.input} />
      <Text style={styles.label}>{t("Saa kila siku", "Time every day")}</Text>
      <TextInput accessibilityLabel={t("Saa katika mfumo wa saa 24", "Time in 24-hour format")} value={time} onChangeText={setTime} placeholder="08:00" placeholderTextColor="#84938e" keyboardType="numbers-and-punctuation" maxLength={5} style={styles.input} />
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={({ pressed }) => [styles.primaryButton, (pressed || busy) && styles.pressed]}><Text style={styles.primaryButtonText}>{busy ? t("Inaongeza…", "Adding…") : t("Ongeza na washa arifa", "Add and enable alert")}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setFormOpen(false); setError(""); }} style={styles.cancelButton}><Text style={styles.cancelText}>{t("Ghairi", "Cancel")}</Text></Pressable>
    </View> : <Pressable accessibilityRole="button" onPress={() => { setFormOpen(true); setNotice(""); }} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>＋  {t("Ongeza dawa au kirutubisho", "Add medicine or supplement")}</Text></Pressable>}

    <View style={styles.safetyNote}><Text style={styles.safetyIcon}>!</Text><Text style={styles.safetyText}>{t("Fuata maelekezo ya mhudumu wako au lebo ya dawa. MWANAMKE haibadilishi kipimo wala ushauri wa kitabibu.", "Follow your care professional’s instructions or the medicine label. MWANAMKE does not change doses or medical advice.")}</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 8 }, flex: { flex: 1, minWidth: 0 }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  eyebrow: { color: "#6e3b62", fontSize: 10, fontWeight: "800", letterSpacing: 1.15, marginBottom: 6 }, summaryEyebrow: { color: "#b9d9cd", fontSize: 10, fontWeight: "800", letterSpacing: 1.15, marginBottom: 6 }, summaryTitle: { color: "#fff", fontSize: 21, lineHeight: 26, fontWeight: "700" },
  title: { color: "#173b37", fontSize: 21, lineHeight: 26, fontWeight: "700" }, pageTitle: { color: "#173b37", fontSize: 35, lineHeight: 40, fontWeight: "700", letterSpacing: -1.1 }, lead: { color: "#5a706a", fontSize: 16, lineHeight: 23, marginTop: 6, marginBottom: 18 },
  summaryCard: { padding: 20, borderRadius: 23, backgroundColor: "#173b37", marginBottom: 14, shadowColor: "#173b37", shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  summaryHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }, progressPill: { minWidth: 46, height: 34, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#dcece5" }, progressText: { color: "#17665c", fontSize: 12, fontWeight: "900" }, count: { color: "#603653", fontSize: 24, fontWeight: "800" },
  medicineRow: { marginTop: 17, paddingTop: 17, flexDirection: "row", alignItems: "flex-start", gap: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,.16)" }, medicineRowCompact: { marginTop: 13, paddingTop: 13, borderTopColor: "#e2e7e4" }, rowMuted: { opacity: 0.56 },
  pillIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#f1d8d7" }, pillIconDone: { backgroundColor: "#dcece5" }, pillGlyph: { color: "#8b4b60", fontSize: 19, fontWeight: "900" }, pillGlyphDone: { color: "#17665c" }, rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, medicineName: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "800" }, medicineNameCompact: { color: "#173b37" }, time: { color: "#d9ece5", fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] }, timeCompact: { color: "#17665c" }, dose: { marginTop: 4, color: "#b8cbc5", fontSize: 12, lineHeight: 17 }, doseCompact: { color: "#60736e" }, status: { color: "#b8cbc5", fontWeight: "800" }, statusCompact: { color: "#60736e" }, statusOverdue: { color: "#ffb8a9" }, statusOverdueCompact: { color: "#9b3b35" },
  actions: { marginTop: 12, flexDirection: "row", gap: 8 }, takenButton: { minHeight: 42, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#e5f1eb" }, takenButtonText: { color: "#17665c", fontSize: 12, fontWeight: "900" }, skipButton: { minHeight: 42, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#64817a", borderRadius: 12 }, skipButtonText: { color: "#dcece5", fontSize: 12, fontWeight: "800" },
  completeState: { marginTop: 17, paddingTop: 17, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,.16)" }, completeIcon: { width: 44, height: 44, borderRadius: 15, color: "#17665c", backgroundColor: "#dcece5", textAlign: "center", lineHeight: 44, fontSize: 20, fontWeight: "900" }, completeTitle: { color: "#fff", fontSize: 15, fontWeight: "800" }, completeText: { marginTop: 3, color: "#b8cbc5", fontSize: 11, lineHeight: 16 },
  manageButton: { minHeight: 46, marginTop: 14, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "rgba(255,255,255,.1)" }, manageButtonText: { color: "#fff", fontSize: 13, fontWeight: "800" }, summaryEmptyText: { marginTop: 14, color: "#c4d6d0", fontSize: 14, lineHeight: 21 }, emptyText: { marginTop: 14, color: "#60736e", fontSize: 14, lineHeight: 21 },
  backButton: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", marginBottom: 10 }, backText: { color: "#17665c", fontSize: 14, fontWeight: "800" }, privacyNote: { padding: 16, flexDirection: "row", gap: 10, borderWidth: 1, borderColor: "#c7ddd4", borderRadius: 17, backgroundColor: "#edf6f2", marginBottom: 14 }, lock: { color: "#17665c", fontSize: 18, fontWeight: "900" }, privacyTitle: { color: "#173b37", fontSize: 13, fontWeight: "800", marginBottom: 3 }, privacyText: { color: "#60736e", fontSize: 11, lineHeight: 16 },
  notice: { padding: 14, color: "#17665c", fontSize: 13, lineHeight: 19, borderRadius: 13, backgroundColor: "#e5f1eb", marginBottom: 14 }, error: { padding: 14, color: "#7b342d", fontSize: 13, lineHeight: 19, borderRadius: 13, backgroundColor: "#fff0ed", marginBottom: 14 },
  listCard: { padding: 20, borderWidth: 1, borderColor: "#d9e1dc", borderRadius: 22, backgroundColor: "#fff", marginBottom: 14 }, manageRow: { borderBottomWidth: 1, borderBottomColor: "#e2e7e4", paddingBottom: 14 }, compactActions: { marginLeft: 56, marginTop: 10, flexDirection: "row", gap: 8 }, compactTakenButton: { minHeight: 42, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#e5f1eb" }, compactTakenText: { color: "#17665c", fontSize: 12, fontWeight: "900" }, compactSkipButton: { minHeight: 42, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#cbd8d1", borderRadius: 12 }, compactSkipText: { color: "#5b706a", fontSize: 12, fontWeight: "800" }, undoButton: { minHeight: 42, marginLeft: 56, marginTop: 8, alignItems: "flex-start", justifyContent: "center" }, undoText: { color: "#603653", fontSize: 12, fontWeight: "800" }, manageActions: { marginLeft: 56, marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, switchLabel: { flexDirection: "row", alignItems: "center", gap: 8 }, switchText: { color: "#5b706a", fontSize: 12, fontWeight: "700" }, removeButton: { minHeight: 44, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" }, removeText: { color: "#9b3b35", fontSize: 12, fontWeight: "800" },
  formCard: { padding: 20, borderWidth: 1, borderColor: "#d9e1dc", borderRadius: 22, backgroundColor: "#fff", marginBottom: 14 }, label: { color: "#344d48", fontSize: 12, fontWeight: "800", marginTop: 17, marginBottom: 7 }, input: { minHeight: 50, paddingHorizontal: 15, borderWidth: 1, borderColor: "#cbd8d1", borderRadius: 13, backgroundColor: "#fbfaf7", color: "#173b37", fontSize: 16 }, primaryButton: { minHeight: 50, marginTop: 16, paddingHorizontal: 17, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#603653" }, primaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "800", textAlign: "center" }, cancelButton: { minHeight: 48, marginTop: 7, alignItems: "center", justifyContent: "center" }, cancelText: { color: "#5b706a", fontSize: 13, fontWeight: "800" },
  safetyNote: { padding: 15, flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 15, backgroundColor: "#efede7" }, safetyIcon: { width: 22, height: 22, borderRadius: 11, color: "#76551a", backgroundColor: "#fff5d7", textAlign: "center", lineHeight: 22, fontWeight: "900" }, safetyText: { flex: 1, color: "#65736f", fontSize: 11, lineHeight: 16 }
});
