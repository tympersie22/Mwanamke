import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { MedicationRemindersScreen, MedicationSummaryCard, useMedicineReminders } from "@/components/MedicationReminders";
import { clearPatientHealth, loadPatientHealth, savePatientHealth } from "@/lib/patient-health-storage";
import {
  cycleSummary,
  localDateKey,
  postpartumSummary,
  pregnancySummary,
  validProfile,
  type DailyCheckIn,
  type LifeStage,
  type PatientHealthProfile,
  type PatientHealthVault
} from "@/lib/patient-health";
import type { PatientTrackerView } from "@/components/PatientTracker";

type Language = "sw" | "en";
type Props = {
  language: Language;
  view: PatientTrackerView;
  onNavigate: (view: PatientTrackerView) => void;
  onOpenAppointments: () => void;
  onBrowseCare: () => void;
  storageScope: string;
  preview: boolean;
};

const stages: LifeStage[] = ["cycle", "pregnancy", "postpartum", "perimenopause"];
const symptoms = ["cramps", "headache", "bloating", "backache"];

function formatDate(value: string | null | undefined, language: Language) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(language === "sw" ? "sw-TZ" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function stageLabel(stage: LifeStage, language: Language) {
  const labels: Record<LifeStage, [string, string]> = {
    cycle: ["Mzunguko", "Cycle"], pregnancy: ["Ujauzito", "Pregnancy"], postpartum: ["Baada ya kujifungua", "Postpartum"], perimenopause: ["Ukomo wa hedhi", "Perimenopause"]
  };
  return labels[stage][language === "sw" ? 0 : 1];
}

export function PrivatePatientTracker(props: Props) {
  const { language, view, onNavigate, onOpenAppointments, onBrowseCare, storageScope } = props;
  const t = useCallback((sw: string, en: string) => language === "sw" ? sw : en, [language]);
  const [vault, setVault] = useState<PatientHealthVault>({ version: 1, checkIns: [] });
  const [loading, setLoading] = useState(true);
  const [unlockFailed, setUnlockFailed] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [stage, setStage] = useState<LifeStage>("cycle");
  const [dateValue, setDateValue] = useState("");
  const [cycleLength, setCycleLength] = useState("28");
  const [periodLength, setPeriodLength] = useState("5");
  const [flow, setFlow] = useState<DailyCheckIn["flow"]>("none");
  const [mood, setMood] = useState<DailyCheckIn["mood"]>("steady");
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [clearConfirm, setClearConfirm] = useState(false);
  const medicineReminders = useMedicineReminders({ language, storageScope, preview: false });

  const hydrate = useCallback(async () => {
    setLoading(true);
    setStorageError("");
    setUnlockFailed(false);
    try {
      const next = await loadPatientHealth(storageScope);
      setVault(next);
      setStage(next.profile?.lifeStage ?? "cycle");
    } catch {
      setUnlockFailed(true);
      setStorageError(t("Taarifa zako binafsi hazikufunguka. Thibitisha kwa alama ya kidole au uso, kisha ujaribu tena.", "Your private information could not be unlocked. Authenticate with biometrics, then try again."));
    } finally {
      setLoading(false);
    }
  }, [storageScope, t]);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const persist = useCallback(async (next: PatientHealthVault) => {
    setStorageError("");
    await savePatientHealth(storageScope, next);
    setVault(next);
  }, [storageScope]);

  const cycle = useMemo(() => cycleSummary(vault.profile), [vault.profile]);
  const pregnancy = useMemo(() => pregnancySummary(vault.profile), [vault.profile]);
  const postpartum = useMemo(() => postpartumSummary(vault.profile), [vault.profile]);
  const today = localDateKey();
  const todayEntry = vault.checkIns.find((entry) => entry.date === today);

  useEffect(() => {
    if (!todayEntry) return;
    setFlow(todayEntry.flow);
    setMood(todayEntry.mood);
    setSelectedSymptoms(todayEntry.symptoms);
  }, [todayEntry]);

  const openProfileForm = (target: LifeStage) => {
    setStage(target);
    setDateValue(target === "cycle" ? vault.profile?.lastPeriodStart ?? "" : target === "pregnancy" ? vault.profile?.estimatedDueDate ?? "" : vault.profile?.deliveryDate ?? "");
    setCycleLength(String(vault.profile?.typicalCycleLength ?? 28));
    setPeriodLength(String(vault.profile?.typicalPeriodLength ?? 5));
    setNotice("");
    setEditing(true);
  };

  const saveProfile = async () => {
    const now = new Date().toISOString();
    const next: PatientHealthProfile = {
      ...vault.profile,
      lifeStage: stage,
      updatedAt: now,
      ...(stage === "cycle" ? { lastPeriodStart: dateValue, typicalCycleLength: Number(cycleLength), typicalPeriodLength: Number(periodLength) } : {}),
      ...(stage === "pregnancy" ? { estimatedDueDate: dateValue } : {}),
      ...(stage === "postpartum" ? { deliveryDate: dateValue } : {})
    };
    if (!validProfile(next) || ((stage === "cycle" || stage === "pregnancy" || stage === "postpartum") && !dateValue)) {
      setStorageError(t("Kagua tarehe. Urefu wa mzunguko lazima uwe siku 21–45 na hedhi siku 1–10.", "Check the date. Cycle length must be 21–45 days and period length 1–10 days."));
      return;
    }
    try {
      await persist({ ...vault, profile: next });
      setEditing(false);
      setNotice(t("Taarifa zimehifadhiwa kwa usimbaji fiche kwenye kifaa hiki.", "Your information is encrypted and saved on this device."));
    } catch {
      setStorageError(t("Taarifa hazikuhifadhiwa salama.", "Your information could not be saved securely."));
    }
  };

  const saveCheckIn = async () => {
    const entry: DailyCheckIn = { date: today, flow, mood, symptoms: selectedSymptoms, updatedAt: new Date().toISOString() };
    const next = { ...vault, checkIns: [...vault.checkIns.filter((item) => item.date !== today), entry] };
    try {
      await persist(next);
      setNotice(t("Kumbukumbu ya leo imehifadhiwa kwa faragha.", "Today’s check-in was saved privately."));
    } catch {
      setStorageError(t("Kumbukumbu haikuhifadhiwa salama.", "Your check-in could not be saved securely."));
    }
  };

  const clearAll = async () => {
    await clearPatientHealth(storageScope);
    setVault({ version: 1, checkIns: [] });
    setEditing(false);
    setClearConfirm(false);
    setNotice(t("Taarifa za afya zilizokuwa kwenye kifaa hiki zimefutwa.", "Private health information on this device was deleted."));
  };

  if (view === "reminders") return <MedicationRemindersScreen language={language} controller={medicineReminders} onBack={() => onNavigate("personal")} />;
  if (loading) return <View style={styles.center}><ActivityIndicator color="#17665c" /><Text style={styles.muted}>{t("Inafungua taarifa binafsi…", "Unlocking private information…")}</Text></View>;
  if (unlockFailed) return <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{storageError}</Text><Primary label={t("Jaribu tena", "Try again")} onPress={() => void hydrate()} /></View>;

  const profileForm = editing ? <View style={styles.formCard}>
    <Text style={styles.eyebrow}>{t("NAFASI YAKO", "YOUR SPACE")}</Text><Text accessibilityRole="header" style={styles.cardTitle}>{t("Chagua unachotaka kufuatilia", "Choose what you want to track")}</Text>
    <View style={styles.wrap}>{stages.map((item) => <Choice key={item} label={stageLabel(item, language)} selected={stage === item} onPress={() => { setStage(item); setDateValue(""); }} />)}</View>
    {stage !== "perimenopause" ? <><Text style={styles.label}>{stage === "cycle" ? t("Siku ya kwanza ya hedhi yako ya mwisho", "First day of your last period") : stage === "pregnancy" ? t("Tarehe inayokadiriwa ya kujifungua", "Estimated due date") : t("Tarehe ya kujifungua", "Delivery date")}</Text><TextInput accessibilityLabel={t("Tarehe katika muundo mwaka-mwezi-siku", "Date in year-month-day format")} value={dateValue} onChangeText={setDateValue} placeholder="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" maxLength={10} style={styles.input} /></> : <Text style={styles.help}>{t("Hifadhi hali hii ili kufuatilia usingizi, hisia na dalili bila makadirio ya homoni.", "Save this stage to track sleep, mood and symptoms without hormonal predictions.")}</Text>}
    {stage === "cycle" ? <View style={styles.twoColumns}><View style={styles.flex}><Text style={styles.label}>{t("Urefu wa mzunguko", "Cycle length")}</Text><TextInput value={cycleLength} onChangeText={setCycleLength} keyboardType="number-pad" maxLength={2} style={styles.input} /></View><View style={styles.flex}><Text style={styles.label}>{t("Siku za hedhi", "Period days")}</Text><TextInput value={periodLength} onChangeText={setPeriodLength} keyboardType="number-pad" maxLength={2} style={styles.input} /></View></View> : null}
    <Text style={styles.help}>{t("Tumia tarehe uliyoijua. Makadirio yanaweza kubadilika na si utambuzi wa kitabibu.", "Use the date you know. Estimates can change and are not a diagnosis.")}</Text>
    <Primary label={t("Hifadhi kwa faragha", "Save privately")} onPress={() => void saveProfile()} />
    <Secondary label={t("Ghairi", "Cancel")} onPress={() => setEditing(false)} />
  </View> : null;

  if (view === "cycle") return <View style={styles.screen}>
    <PageHeader eyebrow={t("MZUNGUKO WANGU", "MY CYCLE")} title={t("Kalenda na makadirio", "Calendar and estimates")} body={t("Makadirio hutumia tarehe na urefu wa mzunguko uliohifadhi.", "Estimates use the date and cycle length you saved.")} />
    {profileForm}
    {!editing && cycle ? <><View style={styles.hero}><Text style={styles.heroLabel}>{t("SIKU YA MZUNGUKO", "CYCLE DAY")}</Text><Text style={styles.heroNumber}>{cycle.cycleDay}</Text><Text style={styles.heroDetail}>{cycle.stale ? t("Tarehe imepitwa na wakati. Sasisha hedhi yako ya mwisho.", "This date may be stale. Update your last period.") : `${t("Hedhi inayofuata inakadiriwa", "Next period estimated")} · ${formatDate(cycle.estimatedNextPeriod, language)}`}</Text></View><View style={styles.stats}><Stat value={String(vault.profile?.typicalCycleLength)} label={t("SIKU ZA MZUNGUKO", "CYCLE DAYS")} /><Stat value={String(vault.profile?.typicalPeriodLength)} label={t("SIKU ZA HEDHI", "PERIOD DAYS")} /></View><View style={styles.safety}><Text style={styles.safetyTitle}>{t("Makadirio pekee", "Estimate only")}</Text><Text style={styles.help}>{t("Tarehe hizi si utambuzi na zisitumike kuzuia mimba. Tafuta ushauri wa mhudumu kuhusu mabadiliko yanayokutia wasiwasi.", "These dates are not a diagnosis and must not be used as contraception. Ask a care professional about changes that concern you.")}</Text></View><Secondary label={t("Sasisha maelezo", "Update details")} onPress={() => openProfileForm("cycle")} /></> : !editing ? <Empty title={t("Ongeza mzunguko wako", "Add your cycle details")} body={t("Hakuna tarehe ya mfano inayoonyeshwa. Weka taarifa zako ili kupata makadirio.", "No sample dates are shown. Add your information to receive estimates.")} action={t("Weka mzunguko", "Set up cycle")} onPress={() => openProfileForm("cycle")} /> : null}
  </View>;

  if (view === "pregnancy") return <View style={styles.screen}>
    <PageHeader eyebrow={t("UJAUZITO WANGU", "MY PREGNANCY")} title={t("Hatua na huduma", "Stage and care")} body={t("Muhtasari huu hutumia tarehe uliyohifadhi.", "This summary uses the date you saved.")} />
    {profileForm}
    {!editing && pregnancy ? <><View style={[styles.hero, styles.heroGreen]}><Text style={styles.heroLabel}>{t(`MUHULA WA ${pregnancy.trimester}`, `TRIMESTER ${pregnancy.trimester}`)}</Text><Text style={styles.heroTitle}>{t(`Wiki ${pregnancy.weeks} + siku ${pregnancy.days}`, `${pregnancy.weeks} weeks + ${pregnancy.days} days`)}</Text><Text style={styles.heroDetail}>{t("Tarehe inayokadiriwa", "Estimated due date")} · {formatDate(vault.profile?.estimatedDueDate, language)}</Text><View style={styles.progress}><View style={[styles.progressFill, { width: `${pregnancy.progress}%` }]} /></View></View><MedicationSummaryCard language={language} controller={medicineReminders} onOpen={() => onNavigate("reminders")} /><UrgentCare language={language} onBrowseCare={onBrowseCare} /><Secondary label={t("Sasisha tarehe", "Update date")} onPress={() => openProfileForm("pregnancy")} /></> : !editing ? <Empty title={t("Ongeza tarehe yako", "Add your pregnancy date")} body={t("Weka tarehe inayokadiriwa uliyopewa na mhudumu. Hatutabuni wiki ya ujauzito.", "Enter the estimated date given by your care professional. We will not invent a pregnancy week.")} action={t("Weka ujauzito", "Set up pregnancy")} onPress={() => openProfileForm("pregnancy")} /> : null}
  </View>;

  const activeStage = vault.profile?.lifeStage;
  const summary = activeStage === "cycle" && cycle ? t(`Siku ya ${cycle.cycleDay}`, `Cycle day ${cycle.cycleDay}`) : activeStage === "pregnancy" && pregnancy ? t(`Wiki ${pregnancy.weeks} + siku ${pregnancy.days}`, `${pregnancy.weeks} weeks + ${pregnancy.days} days`) : activeStage === "postpartum" && postpartum ? t(`Wiki ${postpartum.weeks} ya kupona`, `Recovery week ${postpartum.weeks}`) : activeStage === "perimenopause" ? t("Fuatilia mienendo yako", "Track your patterns") : "";
  return <View style={styles.screen}>
    <PageHeader eyebrow={t(new Intl.DateTimeFormat("sw-TZ", { dateStyle: "full" }).format(new Date()).toUpperCase(), new Intl.DateTimeFormat("en-GB", { dateStyle: "full" }).format(new Date()).toUpperCase())} title={t("Nafasi yangu", "My space")} body={t("Taarifa zako za kila siku, zimehifadhiwa kwa faragha.", "Your daily information, stored privately.")} />
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}{storageError ? <Text accessibilityRole="alert" style={styles.error}>{storageError}</Text> : null}
    {profileForm}
    {!editing && activeStage ? <Pressable accessibilityRole="button" onPress={() => onNavigate(activeStage === "pregnancy" ? "pregnancy" : activeStage === "cycle" ? "cycle" : "personal")} style={[styles.hero, activeStage === "pregnancy" && styles.heroGreen]}><Text style={styles.heroLabel}>{stageLabel(activeStage, language).toUpperCase()}</Text><Text style={styles.heroTitle}>{summary}</Text><Text style={styles.heroDetail}>{t("Gusa kufungua maelezo", "Tap to open details")}</Text></Pressable> : !editing ? <Empty title={t("Anza na taarifa zako", "Start with your information")} body={t("Chagua hatua yako. MWANAMKE haitaonyesha tarehe au makadirio ya mtu mwingine.", "Choose your stage. MWANAMKE will not show another person’s dates or estimates.")} action={t("Weka nafasi yangu", "Set up my space")} onPress={() => openProfileForm("cycle")} /> : null}
    <MedicationSummaryCard language={language} controller={medicineReminders} onOpen={() => onNavigate("reminders")} />
    <View style={styles.card}><Text style={styles.eyebrow}>{t("LEO", "TODAY")}</Text><Text style={styles.cardTitle}>{t("Ukoje leo?", "How are you today?")}</Text><Text style={styles.label}>{t("Mtiririko", "Flow")}</Text><View style={styles.wrap}>{(["none", "light", "medium", "heavy"] as const).map((item) => <Choice key={item} selected={flow === item} onPress={() => setFlow(item)} label={{ none: t("Hakuna", "None"), light: t("Kidogo", "Light"), medium: t("Wastani", "Medium"), heavy: t("Mwingi", "Heavy") }[item]} />)}</View><Text style={styles.label}>{t("Hisia", "Mood")}</Text><View style={styles.wrap}>{(["low", "steady", "good", "great"] as const).map((item) => <Choice key={item} selected={mood === item} onPress={() => setMood(item)} label={{ low: t("Chini", "Low"), steady: t("Sawa", "Steady"), good: t("Nzuri", "Good"), great: t("Bora", "Great") }[item]} />)}</View><Text style={styles.label}>{t("Dalili", "Symptoms")}</Text><View style={styles.wrap}>{symptoms.map((item) => <Choice key={item} selected={selectedSymptoms.includes(item)} onPress={() => setSelectedSymptoms((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} label={{ cramps: t("Tumbo", "Cramps"), headache: t("Kichwa", "Headache"), bloating: t("Kuvimba", "Bloating"), backache: t("Mgongo", "Backache") }[item]!} />)}</View><Primary label={todayEntry ? t("Sasisha kumbukumbu ya leo", "Update today’s check-in") : t("Hifadhi kumbukumbu ya leo", "Save today’s check-in")} onPress={() => void saveCheckIn()} /></View>
    <View style={styles.twoColumns}><Pressable accessibilityRole="button" onPress={onBrowseCare} style={styles.shortcut}><Text style={styles.shortcutIcon}>♡</Text><Text style={styles.shortcutTitle}>{t("Tafuta huduma", "Find care")}</Text></Pressable><Pressable accessibilityRole="button" onPress={onOpenAppointments} style={styles.shortcut}><Text style={styles.shortcutIcon}>＋</Text><Text style={styles.shortcutTitle}>{t("Miadi yangu", "My appointments")}</Text></Pressable></View>
    <View style={styles.privacy}><Text style={styles.privacyTitle}>{t("Imehifadhiwa kwenye kifaa hiki", "Stored on this device")}</Text><Text style={styles.help}>{t("Taarifa hizi zimesimbwa kwa ufunguo wa kifaa. Hazishirikiwi na mhudumu bila hatua tofauti ya ruhusa.", "This information is encrypted with a device key. It is not shared with a care professional without a separate consent action.")}</Text>{clearConfirm ? <><Text style={styles.error}>{t("Hii itafuta tarehe na kumbukumbu zako za kila siku kwenye kifaa hiki.", "This will delete your dates and daily check-ins from this device.")}</Text><Danger label={t("Futa kabisa kwenye kifaa", "Delete from this device")} onPress={() => void clearAll()} /><Secondary label={t("Ghairi", "Cancel")} onPress={() => setClearConfirm(false)} /></> : <Secondary label={t("Dhibiti au futa taarifa", "Manage or delete information")} onPress={() => setClearConfirm(true)} />}</View>
  </View>;
}

function PageHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) { return <View style={styles.header}><Text style={styles.eyebrow}>{eyebrow}</Text><Text accessibilityRole="header" style={styles.pageTitle}>{title}</Text><Text style={styles.lead}>{body}</Text></View>; }
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{selected ? "✓  " : ""}{label}</Text></Pressable>; }
function Primary({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={styles.primaryButton}><Text style={styles.primaryText}>{label}</Text></Pressable>; }
function Secondary({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondaryButton}><Text style={styles.secondaryText}>{label}</Text></Pressable>; }
function Danger({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={styles.dangerButton}><Text style={styles.primaryText}>{label}</Text></Pressable>; }
function Stat({ value, label }: { value: string; label: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function Empty({ title, body, action, onPress }: { title: string; body: string; action: string; onPress: () => void }) { return <View style={styles.empty}><Text style={styles.emptyIcon}>◇</Text><Text style={styles.cardTitle}>{title}</Text><Text style={styles.help}>{body}</Text><Primary label={action} onPress={onPress} /></View>; }
function UrgentCare({ language, onBrowseCare }: { language: Language; onBrowseCare: () => void }) { const t = (sw: string, en: string) => language === "sw" ? sw : en; return <View style={styles.urgent}><Text style={styles.urgentLabel}>{t("USISUBIRI", "DO NOT WAIT")}</Text><Text style={styles.urgentTitle}>{t("Dalili ya hatari inahitaji huduma ya haraka", "A danger sign needs urgent care")}</Text><Text style={styles.help}>{t("Kutokwa damu, degedege, maumivu makali ya kichwa au tumbo, kupumua kwa shida, au kupungua kwa harakati za mtoto kunahitaji tathmini ya haraka. MWANAMKE si huduma ya dharura.", "Bleeding, seizures, severe headache or abdominal pain, difficulty breathing, or reduced baby movement needs urgent assessment. MWANAMKE is not an emergency service.")}</Text><Danger label={t("Tafuta kituo cha huduma", "Find a care facility")} onPress={onBrowseCare} /></View>; }

const styles = StyleSheet.create({
  screen:{paddingBottom:8}, center:{minHeight:280,alignItems:"center",justifyContent:"center",gap:14}, header:{marginBottom:20}, eyebrow:{color:"#6e3b62",fontSize:10,fontWeight:"900",letterSpacing:1.2,marginBottom:7}, pageTitle:{color:"#173b37",fontSize:35,lineHeight:40,fontWeight:"700",letterSpacing:-1}, lead:{color:"#5a706a",fontSize:16,lineHeight:23,marginTop:7}, muted:{color:"#60736e",fontSize:13}, card:{padding:20,borderWidth:1,borderColor:"#d9e1dc",borderRadius:22,backgroundColor:"#fff",marginBottom:14}, formCard:{padding:20,borderWidth:1,borderColor:"#c5d8cf",borderRadius:24,backgroundColor:"#fff",marginBottom:14}, cardTitle:{color:"#173b37",fontSize:21,lineHeight:27,fontWeight:"800"}, label:{color:"#344d48",fontSize:12,fontWeight:"800",marginTop:17,marginBottom:7}, input:{minHeight:50,paddingHorizontal:15,borderWidth:1,borderColor:"#cbd8d1",borderRadius:13,backgroundColor:"#fbfaf7",color:"#173b37",fontSize:16}, wrap:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:8}, choice:{minHeight:42,paddingHorizontal:13,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"#d2ddd7",borderRadius:21,backgroundColor:"#fff"}, choiceSelected:{borderColor:"#603653",backgroundColor:"#603653"}, choiceText:{color:"#4f655f",fontSize:12,fontWeight:"800"}, choiceTextSelected:{color:"#fff"}, flex:{flex:1,minWidth:0}, twoColumns:{flexDirection:"row",gap:10}, help:{color:"#60736e",fontSize:12,lineHeight:18,marginTop:10}, primaryButton:{minHeight:50,marginTop:16,paddingHorizontal:16,alignItems:"center",justifyContent:"center",borderRadius:14,backgroundColor:"#603653"}, primaryText:{color:"#fff",fontSize:14,fontWeight:"900",textAlign:"center"}, secondaryButton:{minHeight:48,marginTop:8,paddingHorizontal:16,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"#cbd8d1",borderRadius:14,backgroundColor:"#fff"}, secondaryText:{color:"#344d48",fontSize:13,fontWeight:"800",textAlign:"center"}, dangerButton:{minHeight:48,marginTop:12,paddingHorizontal:16,alignItems:"center",justifyContent:"center",borderRadius:14,backgroundColor:"#9b3b35"}, notice:{padding:14,color:"#17665c",fontSize:13,lineHeight:19,borderRadius:13,backgroundColor:"#e5f1eb",marginBottom:14}, error:{padding:13,color:"#7b342d",fontSize:12,lineHeight:18,borderRadius:12,backgroundColor:"#fff0ed",marginBottom:10}, hero:{padding:23,borderRadius:26,borderBottomLeftRadius:9,backgroundColor:"#eadde7",marginBottom:14}, heroGreen:{backgroundColor:"#d2e6dc"}, heroLabel:{color:"#6e3b62",fontSize:10,fontWeight:"900",letterSpacing:1.2}, heroNumber:{color:"#173b37",fontSize:64,lineHeight:72,fontWeight:"700",letterSpacing:-2}, heroTitle:{color:"#173b37",fontSize:29,lineHeight:36,fontWeight:"800",marginTop:12}, heroDetail:{color:"#536d66",fontSize:13,lineHeight:20,marginTop:7}, progress:{height:8,marginTop:22,borderRadius:4,backgroundColor:"rgba(255,255,255,.55)",overflow:"hidden"}, progressFill:{height:"100%",borderRadius:4,backgroundColor:"#17665c"}, stats:{flexDirection:"row",gap:10,marginBottom:14}, stat:{flex:1,minHeight:100,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"#d9e1dc",borderRadius:20,backgroundColor:"#fff"}, statValue:{color:"#603653",fontSize:29,fontWeight:"800"}, statLabel:{color:"#60736e",fontSize:9,fontWeight:"900",textAlign:"center",marginTop:4}, safety:{padding:17,borderRadius:17,backgroundColor:"#efede7",marginBottom:12}, safetyTitle:{color:"#76551a",fontSize:13,fontWeight:"900"}, empty:{padding:24,alignItems:"stretch",borderWidth:1,borderStyle:"dashed",borderColor:"#b9ccc3",borderRadius:24,backgroundColor:"#fbfaf7",marginBottom:14}, emptyIcon:{color:"#17665c",fontSize:28,marginBottom:12}, shortcut:{flex:1,minHeight:114,padding:17,justifyContent:"space-between",borderWidth:1,borderColor:"#d9e1dc",borderRadius:20,backgroundColor:"#fff",marginBottom:14}, shortcutIcon:{color:"#17665c",fontSize:25,fontWeight:"900"}, shortcutTitle:{color:"#173b37",fontSize:15,fontWeight:"800"}, privacy:{padding:19,borderRadius:20,backgroundColor:"#e8f2ed",marginBottom:14}, privacyTitle:{color:"#173b37",fontSize:15,fontWeight:"900"}, urgent:{padding:20,borderWidth:1,borderColor:"#e6bcb5",borderRadius:21,backgroundColor:"#fff2ef",marginBottom:14}, urgentLabel:{color:"#9b3b35",fontSize:9,fontWeight:"900",letterSpacing:1.2}, urgentTitle:{color:"#642f2b",fontSize:20,lineHeight:26,fontWeight:"800",marginTop:6}
});
