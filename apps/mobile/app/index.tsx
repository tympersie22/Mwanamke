import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiUrl, clearSession, restoreSession, signIn, type Session } from "@/lib/auth";
import { PatientTracker, type PatientTrackerView } from "@/components/PatientTracker";

type Row = { id: string; displayName?: string; titleEn?: string; titleSw?: string; languages?: string[]; status?: string; startsAt?: string; mode?: string; amountTzs?: number; currency?: string; nameEn?: string; nameSw?: string; priceTzs?: number; holdExpiresAt?: string; kind?: "export"|"deletion"; createdAt?: string; facility?: { nameEn: string; nameSw: string; locality: string; accessibilityEn: string; accessibilitySw: string } };
type Actor = { id: string; role: string };
export default function MobileApp() {
  const [language, setLanguage] = useState<"sw"|"en">("sw");
  const [step,setStep] = useState<"language"|"privacy"|"care">("language");
  const [session,setSession] = useState<Session|null>(null);
  const [actor,setActor] = useState<Actor|null>(null);
  const [path,setPath] = useState("providers");
  const [rows,setRows] = useState<Row[]>([]);
  const [cursor,setCursor] = useState<string|null>(null);
  const [provider,setProvider] = useState<Row|null>(null);
  const [service,setService] = useState<Row|null>(null);
  const [notice,setNotice] = useState("");
  const [metrics,setMetrics] = useState<Record<string,number>>({});
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [obscured,setObscured] = useState(false);
  const [locked,setLocked] = useState(false);
  const [patientPreview,setPatientPreview] = useState(false);
  const isPatientTracker = actor?.role === "patient" && ["personal","cycle","pregnancy"].includes(path);
  const t = (sw:string,en:string) => language === "sw" ? sw : en;
  const roleExperience = actor?.role === "provider"
    ? { label:t("Mtoa huduma","Care professional"), title:t("Ratiba yako ya huduma","Your care schedule") }
    : actor?.role === "navigator"
      ? { label:t("Mratibu wa huduma","Care navigator"), title:t("Kazi za uratibu","Care coordination") }
      : actor?.role?.endsWith("admin")
        ? { label:t("Msimamizi","Administrator"), title:t("Uendeshaji wa mfumo","System operations") }
        : { label:t("Mgonjwa","Patient"), title:t("Mahali pa huduma yako","Your care space") };
  const statusLabel = (status?:string) => {
    if(!status) return t("Haijulikani","Unknown");
    const labels:Record<string,[string,string]> = {
      requested:["Imeombwa","Requested"], confirmed:["Imethibitishwa","Confirmed"], cancelled:["Imeghairiwa","Cancelled"],
      expired:["Muda umeisha","Expired"], completed:["Imekamilika","Completed"], no_show:["Hakuhudhuria","Did not attend"],
      submitted:["Imewasilishwa","Submitted"], queued:["Kwenye foleni","Queued"], paid:["Imelipwa","Paid"],
      reserved:["Imehifadhiwa","Reserved"], failed:["Imeshindikana","Failed"], refunded:["Imerejeshwa","Refunded"],
      sponsored:["Imedhaminiwa","Sponsored"], open:["Wazi","Open"], active:["Hai","Active"]
    };
    const pair=labels[status.toLowerCase()];
    return pair ? t(pair[0],pair[1]) : t("Hali ya taarifa","Record status");
  };
  const metricLabel = (name:string) => ({
    activeMembers:t("Wanachama hai","Active members"),
    appointmentCompletionRate:t("Asilimia ya miadi iliyokamilika","Appointment completion rate"),
    facilities:t("Vituo vilivyothibitishwa","Verified facilities")
  }[name] ?? t("Kipimo cha mfumo","System metric"));
  useEffect(() => {
    void AsyncStorage.getItem("mwanamke.language").then(value => { if(value === "sw" || value === "en") setLanguage(value); });
    void restoreSession().then(value => { if(value) { setSession(value); setStep("care"); } }).catch(() => setError(t("Hifadhi salama haipatikani. Tafadhali ingia tena.", "Secure storage is unavailable. Please sign in again.")));
    return undefined;
  },[]);
  useEffect(() => {
    let backgrounded = false;
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") { backgrounded = true; setObscured(true); setLocked(true); return; }
      setObscured(false);
      if (!backgrounded || !session) { setLocked(false); return; }
      void LocalAuthentication.authenticateAsync({ promptMessage: t("Fungua taarifa zako binafsi", "Unlock your private records"), biometricsSecurityLevel: "strong", disableDeviceFallback: true }).then(result => setLocked(!result.success)).catch(() => setLocked(true));
      backgrounded = false;
    });
    return () => subscription.remove();
  }, [session, language]);
  const logout = async () => { await clearSession(); setSession(null); setActor(null); setRows([]); setMetrics({}); setPatientPreview(false); setStep("privacy"); };
  const request = async (endpoint:string, current:Session) => {
    if(current.expiresAt <= Date.now()) { await logout(); throw new Error(t("Kipindi kimeisha. Ingia tena.","Session expired. Please sign in again.")); }
    const response = await fetch(`${apiUrl()}/v1/${endpoint}`,{headers:{Authorization:`Bearer ${current.accessToken}`}});
    if(response.status === 401) { await logout(); throw new Error(t("Ingia tena.","Please sign in again.")); }
    if(!response.ok) throw new Error(response.status === 403 ? t("Huruhusiwi kufikia huduma hii.","Your account cannot access this service.") : t("Huduma haipatikani. Jaribu tena ukiwa mtandaoni.","Service unavailable. Check your connection and retry."));
    return response.json();
  };
  const load = async (endpoint:string,current = session,more?:string) => {
    if(["personal","cycle","pregnancy"].includes(endpoint)) {setPath(endpoint);setRows([]);setCursor(null);setError("");setBusy(false);return;}
    if(patientPreview && !current) {setNotice(t("Ingia ili kufungua huduma hii salama.","Sign in to open this secure service."));setError("");return;}
    if(!current) return;
    setBusy(true);setError("");
    try { const result = await request(`${endpoint}${more ? `?cursor=${encodeURIComponent(more)}` : ""}`,current);
      if(endpoint === "admin/aggregate") { setMetrics(result.data ?? result);setRows([]);setCursor(null); }
      else { if(!Array.isArray(result.data)) throw new Error(t("Jibu la huduma halikuwa sahihi.", "The service returned an invalid response."));setRows(old => more ? [...old,...result.data] : result.data);setCursor(result.nextCursor); }
      setPath(endpoint);
    } catch(reason) { setError(reason instanceof Error ? reason.message : t("Huduma haipatikani.", "Service unavailable.")); } finally { setBusy(false); }
  };
  useEffect(() => {
    if(!session) return;
    let active=true;
    void request("me",session).then(result => { if(!active)return; setActor(result.data);void load(result.data.role === "provider" ? "appointments" : result.data.role === "navigator" ? "navigator/assignments" : result.data.role.endsWith("admin") ? "admin/aggregate" : "personal",session); }).catch(reason => { if(active)setError(reason.message); });
    return () => { active=false; };
    // Session changes re-verify server-owned identity.
  },[session]);
  const mutate = async (endpoint:string,payload:object,method:"POST"|"PATCH"="POST") => {
    if(!session)return;
    setBusy(true);setError("");setNotice("");
    try {
      if(session.expiresAt<=Date.now()) {await logout();throw new Error(t("Ingia tena.","Please sign in again."));}
      const response=await fetch(`${apiUrl()}/v1/${endpoint}`,{method,headers:{Authorization:`Bearer ${session.accessToken}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
      if(!response.ok)throw new Error(t("Ombi halijakamilika. Sasisha taarifa kisha jaribu tena.","The request could not be completed. Refresh your records and try again."));
      if(endpoint==="profile") setNotice(t("Lugha imehifadhiwa kwenye akaunti.","Your account language has been saved."));
      else if(endpoint==="privacy/requests") {setNotice(t("Ombi limepokelewa; timu ya faragha bado inapaswa kulishughulikia.","Request received; the privacy team must still fulfill it."));await load("privacy/requests");}
      else {setNotice(endpoint==="appointments"?t("Nafasi imehifadhiwa kwa muda. Bado haijathibitishwa.","The slot is temporarily held. It is not yet confirmed."):t("Ombi limehifadhiwa.","Your request has been saved."));setProvider(null);setService(null);await load("appointments");}
    }catch(reason){setError(reason instanceof Error?reason.message:t("Huduma haipatikani.","Service unavailable."));}finally{setBusy(false);}
  };
  const login = async () => {setBusy(true);setError("");try {const value=await signIn();if(value){setSession(value);setStep("care");}}catch{setError(t("Kuingia hakupatikani. Tafadhali jaribu tena.","Sign-in is unavailable. Please try again."));}finally{setBusy(false);}};
  const openPatientPreview = () => {setError("");setNotice("");setPatientPreview(true);setActor({id:"local-patient-preview",role:"patient"});setPath("personal");setStep("care");};
  const continueInWebPortal = async () => {
    const configured = process.env.EXPO_PUBLIC_PORTAL_ORIGIN;
    const destination = configured?.startsWith("https://") || (__DEV__ && configured?.startsWith("http://localhost")) ? configured : __DEV__ ? "http://localhost:3000" : "";
    if (!destination) { setError(t("Tovuti salama haijaunganishwa kwenye toleo hili.", "The secure web portal is not configured for this build.")); return; }
    await Linking.openURL(destination);
  };
  const chooseLanguage = async (value:"sw"|"en") => {setError("");setLanguage(value);try{await AsyncStorage.setItem("mwanamke.language",value);}catch{setError(value === "sw" ? "Lugha haijahifadhiwa." : "Language preference could not be saved.");}};
  const button = (label:string, action:()=>void, primary=false) => <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy}} onPress={action} style={[styles.button,primary && styles.primary]}><Text style={[styles.buttonText,primary && styles.primaryText]}>{label}</Text></Pressable>;
  if(obscured || locked) return <SafeAreaView style={styles.safe}><Text style={styles.brand}>MWANAMKE</Text>{locked && <Text style={styles.body}>{t("Thibitisha utambulisho wako ili kuendelea.", "Authenticate to continue.")}</Text>}</SafeAreaView>;
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Text style={styles.brand}>MWANAMKE</Text>
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.body}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {busy && <ActivityIndicator accessibilityLabel={t("Inapakia","Loading")} size="large" color="#17665c"/>}
    {step === "language" ? <><Text accessibilityRole="header" style={styles.title}>{t("Karibu. Chagua lugha yako.","Welcome. Choose your language.")}</Text><Text style={styles.body}>{t("Huduma, kwa hatua yako.","Care, at your pace.")}</Text>{button("Kiswahili",()=>void chooseLanguage("sw"),language === "sw")}{button("English",()=>void chooseLanguage("en"),language === "en")}{button(t("Endelea","Continue"),()=>{setError("");setStep("privacy");},true)}</> : step === "privacy" ? <><Text accessibilityRole="header" style={styles.title}>{t("Nafasi yako ya faragha","Your private care space")}</Text><View style={styles.card}><Text style={styles.body}>{t("Huduma hii si ya dharura. Usitumie kwa usaidizi wa haraka. Taarifa za akaunti na miadi zinahifadhiwa na huduma. Hakuna taarifa za afya zinazohitajika ili kuingia.","This service is not for emergencies. Do not rely on it for urgent help. Account and appointment information is stored by the service. No health details are needed to sign in.")}</Text></View><Text style={styles.body}>{t("Watoa huduma na wafanyakazi hutumia akaunti zilizoalikwa na kuthibitishwa.","Care professionals and staff use invited and verified accounts.")}</Text>{Platform.OS === "web" ? button(t("Endelea kwenye tovuti salama","Continue in secure web portal"),()=>void continueInWebPortal(),true) : button(t("Ingia au jisajili","Sign in or register"),()=>void login(),true)}{__DEV__ && Platform.OS !== "web" ? button(t("Fungua onyesho la nafasi ya mgonjwa","Open patient space preview"),openPatientPreview) : null}{button(t("Badili lugha","Change language"),()=>{setError("");setStep("language");})}</> : <>
      {!isPatientTracker ? <><Text style={styles.verified}>{roleExperience.label}</Text><Text accessibilityRole="header" style={styles.title}>{roleExperience.title}</Text></> : null}
      {actor && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.nav,actor.role === "patient" && styles.patientNav]}>{(actor.role === "patient" ? [["personal",t("Leo","Today")],["cycle",t("Mzunguko","Cycle")],["pregnancy",t("Ujauzito","Pregnancy")],["providers",t("Huduma","Care")],["appointments",t("Miadi","Appointments")]] : actor.role === "provider" ? [["appointments",t("Ratiba","Schedule")],["providers",t("Huduma","Directory")]] : actor.role === "navigator" ? [["navigator/assignments",t("Kazi","Assignments")],["providers",t("Huduma","Directory")]] : [["admin/aggregate",t("Muhtasari","Overview")]]).concat([["privacy/requests",t("Akaunti","Account")]]).map(([endpoint,label])=><View key={endpoint} style={styles.navItem}>{button(label!,()=>{setProvider(null);setService(null);setNotice("");void load(endpoint!);},path===endpoint)}</View>)}</ScrollView>}
      {isPatientTracker ? <><PatientTracker language={language} view={path as PatientTrackerView} onNavigate={(next)=>void load(next)} onOpenAppointments={()=>void load("appointments")} onBrowseCare={()=>void load("providers")} />{patientPreview ? button(t("Funga onyesho","Close preview"),()=>void logout()) : null}</> : <>
      {path==="privacy/requests" && <View style={styles.card}><Text accessibilityRole="header" style={styles.subtitle}>{t("Lugha na taarifa zako","Your language and information")}</Text>{button(t("Hifadhi lugha hii kwenye akaunti","Save this language to account"),()=>void mutate("profile",{preferredLanguage:language},"PATCH"))}<Text style={styles.body}>{t("Unaweza kuomba nakala ya taarifa au kufutwa kwa akaunti. Ombi halifuti wala kutuma taarifa papo hapo.","You can request a data copy or account deletion. A request does not immediately delete or send data.")}</Text>{button(t("Omba nakala ya taarifa","Request data export"),()=>void mutate("privacy/requests",{kind:"export",idempotencyKey:Crypto.randomUUID()}))}{button(t("Omba kufutwa kwa akaunti","Request account deletion"),()=>void mutate("privacy/requests",{kind:"deletion",idempotencyKey:Crypto.randomUUID()}))}</View>}
      {path.includes("/availability") && <Text style={styles.body}>{t("Chagua nafasi ya huduma yako.","Choose a slot for your service.")}</Text>}
      {!busy && !error && rows.length===0 && path!=="admin/aggregate" && <View style={styles.card}><Text accessibilityRole="header" style={styles.subtitle}>{t("Hakuna taarifa bado","Nothing here yet")}</Text><Text style={styles.body}>{t("Taarifa zitapatikana hapa huduma inapopatikana kwa akaunti yako.","Records will appear here when they are available for your account.")}</Text></View>}
      {rows.map(row=><View style={styles.card} key={row.id}><Text accessibilityRole="header" style={styles.subtitle}>{row.kind ? (row.kind==="export"?t("Ombi la nakala","Export request"):t("Ombi la kufuta","Deletion request")) : row.displayName ?? (language === "sw" ? row.nameSw : row.nameEn) ?? statusLabel(row.status)}</Text>{row.kind ? <Text style={styles.body}>{statusLabel(row.status)} — {row.createdAt && new Date(row.createdAt).toLocaleDateString(language === "sw" ? "sw-TZ":"en-GB")}</Text> : row.displayName ? <><Text style={styles.verified}>{t("Imethibitishwa","Verified")}</Text><Text style={styles.body}>{language === "sw" ? row.titleSw : row.titleEn}</Text><Text style={styles.body}>{row.languages?.join(", ")}</Text>{button(t("Huduma na bei","Services and prices"),()=>{setProvider(row);setService(null);void load(`providers/${row.id}/services`);})}</> : row.nameEn ? <><Text style={styles.body}>{row.mode === "virtual" ? t("Mtandaoni","Online") : t("Ana kwa ana","In person")} — TZS {row.priceTzs?.toLocaleString()}</Text><Text style={styles.body}>{language === "sw" ? row.facility?.nameSw : row.facility?.nameEn} — {row.facility?.locality}</Text><Text style={styles.body}>{language === "sw" ? row.facility?.accessibilitySw : row.facility?.accessibilityEn}</Text>{button(t("Chagua nafasi","Choose a slot"),()=>{setService(row);void load(`providers/${provider!.id}/availability`);})}</> : <>{row.startsAt && <Text style={styles.body}>{new Intl.DateTimeFormat(language === "sw" ? "sw-TZ":"en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Africa/Dar_es_Salaam"}).format(new Date(row.startsAt))} (Africa/Dar_es_Salaam)</Text>}{row.amountTzs !== undefined && <Text style={styles.body}>{row.currency ?? "TZS"} {row.amountTzs.toLocaleString()}</Text>}{service && path.endsWith("/availability") && actor?.role==="patient" && row.mode===service.mode && <><Text style={styles.body}>{language === "sw" ? service.nameSw : service.nameEn} — TZS {service.priceTzs?.toLocaleString()}</Text>{button(t("Hifadhi kwa dakika 15","Hold for 15 minutes"),()=>void mutate("appointments",{slotId:row.id,serviceId:service.id,mode:row.mode,idempotencyKey:Crypto.randomUUID()}),true)}</>}{path==="appointments" && actor?.role==="patient" && <>{row.status==="requested" && row.holdExpiresAt && <Text style={styles.body}>{t("Muda wa nafasi unaisha","Hold expires")} {new Date(row.holdExpiresAt).toLocaleTimeString(language === "sw" ? "sw-TZ":"en-GB")}</Text>}{row.status==="requested" && row.amountTzs===0 && button(t("Thibitisha miadi bila malipo","Confirm free appointment"),()=>void mutate(`appointments/${row.id}/confirm`,{}),true)}{row.status==="requested" && (row.amountTzs??0)>0 && <Text style={styles.body}>{t("Malipo bado hayapatikani. Nafasi hii haijathibitishwa.","Payment is not available yet. This appointment is not confirmed.")}</Text>}{["requested","confirmed"].includes(row.status??"") && button(t("Ghairi miadi","Cancel appointment"),()=>void mutate(`appointments/${row.id}/cancel`,{}))}</>}</>}</View>)}
      {path==="admin/aggregate" && Object.entries(metrics).filter(([,value])=>typeof value==="number").map(([name,value])=><View style={styles.card} key={name}><Text style={styles.body}>{metricLabel(name)}</Text><Text style={styles.subtitle}>{name === "appointmentCompletionRate" ? new Intl.NumberFormat(language === "sw" ? "sw-TZ":"en-GB",{style:"percent",maximumFractionDigits:1}).format(value) : value.toLocaleString(language === "sw" ? "sw-TZ":"en-GB")}</Text></View>)}
      {cursor && button(t("Onyesha zaidi","Load more"),()=>void load(path,session,cursor))}
      {button(t("Sasisha","Refresh"),()=>void load(path))}{button(t("Ondoka kwenye kifaa hiki","Sign out of this device"),()=>void logout())}
      </>}
    </>}
    <Text style={styles.footer}>{t("Usitumie kwa dharura.","Not an emergency service.")}</Text>
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:"#f6f5f0"},content:{padding:24,paddingBottom:48,maxWidth:760,width:"100%",alignSelf:"center"},brand:{color:"#17665c",fontSize:20,fontWeight:"800",letterSpacing:2,marginBottom:32},title:{fontSize:34,lineHeight:42,color:"#163b37",fontWeight:"700",marginBottom:20},subtitle:{fontSize:21,lineHeight:28,fontWeight:"700",color:"#163b37",marginBottom:10},body:{fontSize:17,lineHeight:27,color:"#435e56",marginBottom:12},card:{padding:24,borderRadius:20,borderWidth:1,borderColor:"#d4dfd7",backgroundColor:"white",marginBottom:16},button:{minHeight:48,paddingHorizontal:18,paddingVertical:14,justifyContent:"center",borderRadius:13,borderWidth:1,borderColor:"#aac3b6",backgroundColor:"white",marginBottom:12},primary:{backgroundColor:"#17665c",borderColor:"#17665c"},buttonText:{fontSize:17,fontWeight:"600",color:"#163b37",textAlign:"center"},primaryText:{color:"white"},nav:{paddingRight:24,marginBottom:16,flexDirection:"row",gap:7},patientNav:{paddingBottom:2},navItem:{minWidth:106},error:{padding:18,backgroundColor:"#fff0e9",color:"#713719",fontSize:17,lineHeight:25,borderRadius:12,marginBottom:18},verified:{color:"#17665c",fontSize:15,fontWeight:"700",marginBottom:8},footer:{fontSize:14,color:"#435e56",marginTop:28}});
