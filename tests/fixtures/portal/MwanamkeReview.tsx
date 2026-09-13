// Historical visual fixture only. This file is outside application source and must never be imported by a release.
"use client";

import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, Bell, BookHeart, Bot, Building2,
  CalendarDays, CameraOff, Check, CheckCircle2, ChevronRight, CircleUserRound, ClipboardCheck,
  Clock3, Cloud, CloudOff, CreditCard, Download, Droplets, Eye, EyeOff, FileHeart, FileKey2,
  FileText, Fingerprint, Globe2, Heart, HeartHandshake, HelpCircle, History, Home, KeyRound,
  FlaskConical, Languages, Lock, LockKeyhole, MapPin, Menu, MessageCircle, MicOff, PackageCheck,
  MonitorCog, Moon, Pill, Plus, Search, Send, Shield, ShieldCheck, ShoppingBag, Smartphone, Sparkles, Sun,
  Stethoscope, TestTube2, Trash2, UserRoundCheck, UsersRound, Video, Wifi, X,
  type LucideIcon
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { auditEvents, careCases, clinicalContent, demoAppointment, products, providers, type Provider } from "@mwanamke/domain";
import { dictionaries, type Language, type MessageKey } from "@mwanamke/i18n";
import { encryptSensitiveRecord, generateDeviceKey } from "@mwanamke/security";

type Workspace = "patient" | "provider" | "navigator" | "admin";
type Theme = "light" | "dark" | "system";
type Screen =
  | "access" | "language" | "intro1" | "intro2" | "intro3" | "privacy" | "account" | "pin" | "recovery" | "interests"
  | "home" | "health" | "cycle" | "symptom" | "pregnancy" | "postpartum" | "wellbeing"
  | "care" | "provider" | "booking" | "payment" | "confirmation" | "appointments" | "waiting"
  | "navigator" | "labs" | "labStatus" | "result" | "pharmacy" | "essentials" | "cart"
  | "safety" | "contacts" | "checkin" | "support" | "wallet" | "sharing" | "history"
  | "profile" | "privacyCentre" | "notifications" | "languageSettings" | "devices" | "offline" | "empty";

type T = (key: MessageKey) => string;

const screenTitles: Partial<Record<Screen, MessageKey>> = {
  health: "health.title", cycle: "cycle.title", symptom: "symptom.title", pregnancy: "pregnancy.title",
  postpartum: "postpartum.title", wellbeing: "wellbeing.title", care: "care.title", provider: "provider.about",
  booking: "booking.title", payment: "payment.title", confirmation: "confirmation.title", appointments: "appointments.title",
  waiting: "waiting.title", navigator: "navigator.title", labs: "labs.title", labStatus: "labs.statusTitle",
  result: "labs.viewer", pharmacy: "pharmacy.title", essentials: "essentials.title", cart: "essentials.cart",
  safety: "safety.title", contacts: "safety.contactTitle", checkin: "safety.checkTitle", support: "safety.supportTitle",
  wallet: "wallet.title", sharing: "sharing.title", history: "history.title", profile: "profile.title",
  privacyCentre: "privacyCentre.title", notifications: "notifications.title", languageSettings: "language.title",
  devices: "devices.title", offline: "offline.title", empty: "empty.title"
};

const mainScreens: Screen[] = ["home", "care", "appointments", "essentials", "profile"];
const onboardingScreens: Screen[] = ["access", "language", "intro1", "intro2", "intro3", "privacy", "account", "pin", "recovery", "interests"];

export function MwanamkeApp({ reviewMode, authEntryUrl }: { reviewMode: boolean; authEntryUrl: string }) {
  const [language, setLanguageState] = useState<Language>("sw");
  const [screen, setScreen] = useState<Screen>("access");
  const [workspace, setWorkspace] = useState<Workspace>("patient");
  const [theme, setTheme] = useState<Theme>("system");
  const [selectedProvider, setSelectedProvider] = useState<Provider>(providers[0]!);
  const [privacyMode, setPrivacyMode] = useState(true);
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [pin, setPin] = useState("");
  const [dangerOpen, setDangerOpen] = useState(false);
  const [sharingActive, setSharingActive] = useState(false);
  const [symptomSaved, setSymptomSaved] = useState(false);
  const deviceKeyRef = useRef<CryptoKey | null>(null);
  const t = (key: MessageKey) => dictionaries[language][key];

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const savedLanguage = window.localStorage.getItem("mwanamke.language");
      if (savedLanguage === "en" || savedLanguage === "sw") setLanguageState(savedLanguage);
      const savedTheme = window.localStorage.getItem("mwanamke.theme");
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") setTheme(savedTheme);
      const query = new URLSearchParams(window.location.search);
      const demo = query.get("demo") as Screen | null;
      const requestedWorkspace = query.get("workspace") as Workspace | null;
      if (demo && (screenTitles[demo] || mainScreens.includes(demo))) setScreen(demo);
      if (requestedWorkspace && ["patient", "provider", "navigator", "admin"].includes(requestedWorkspace)) {
        setWorkspace(requestedWorkspace);
        setScreen("home");
      }
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    const clear = () => setToast(null);
    if (toast) {
      const id = window.setTimeout(clear, 2800);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [toast]);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    window.localStorage.setItem("mwanamke.language", next);
    document.documentElement.lang = next;
  };

  const setPreferredTheme = (next: Theme) => {
    setTheme(next);
    window.localStorage.setItem("mwanamke.theme", next);
  };

  const go = (next: Screen) => {
    setDangerOpen(false);
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const announce = (message: string) => setToast(message);

  const saveSymptom = async () => {
    try {
      deviceKeyRef.current ??= await generateDeviceKey();
      const envelope = await encryptSensitiveRecord({ flow: "medium", mood: "calm", recordedAt: new Date().toISOString() }, deviceKeyRef.current, "symptom-log");
      const response = await fetch("/api/envelopes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(envelope) });
      if (!response.ok) throw new Error("Envelope storage failed");
      setSymptomSaved(true);
      announce(t("symptom.saved"));
    } catch {
      setOnline(false);
      setSymptomSaved(true);
      announce(t("home.offline"));
    }
  };

  const showAppChrome = workspace === "patient" && !onboardingScreens.includes(screen);
  const portalTitle = workspace === "patient" ? "portal.patient" : workspace === "provider" ? "portal.provider" : workspace === "navigator" ? "portal.navigator" : "portal.admin";

  const enterWorkspace = (role: Workspace, intent: "signin" | "signup") => {
    if (!reviewMode) {
      const url = new URL(authEntryUrl);
      url.searchParams.set("role_hint", role);
      url.searchParams.set("screen_hint", intent);
      window.location.assign(url.toString());
      return;
    }
    if (role === "patient" && intent === "signup") { setWorkspace("patient"); go("language"); return; }
    setWorkspace(role);
    go("home");
    announce(language === "sw" ? "Umeingia kwenye mazingira ya majaribio" : "Signed in to the local review environment");
  };

  return (
    <div className={`app-root workspace-${workspace} ${reviewMode ? "review-mode" : "production-mode"}`} data-theme={theme}>
      <a className="skip-link" href="#main-content">{language === "sw" ? "Ruka hadi maudhui" : "Skip to content"}</a>
      {reviewMode && <DemoBar workspace={workspace} setWorkspace={(next) => { setWorkspace(next); setScreen("home"); }} onAccess={() => { setWorkspace("patient"); setScreen("access"); }} language={language} setLanguage={setLanguage} theme={theme} setTheme={setPreferredTheme} t={t} portalTitle={portalTitle} />}
      {workspace === "patient" ? (
        <div className={`patient-shell ${showAppChrome ? "with-chrome" : "onboarding-shell"}`}>
          {showAppChrome && <DesktopRail current={screen} go={go} t={t} privacyMode={privacyMode} />}
          <div className="patient-canvas">
            {showAppChrome && <MobileHeader screen={screen} go={go} t={t} online={online} privacyMode={privacyMode} setPrivacyMode={setPrivacyMode} />}
            <main id="main-content" className={showAppChrome ? "screen-content" : "onboarding-content"}>
              {screen === "access" ? <AccessScreen language={language} reviewMode={reviewMode} enter={enterWorkspace} /> : <PatientScreen
                screen={screen} language={language} setLanguage={setLanguage} go={go} t={t}
                provider={selectedProvider} selectProvider={(provider) => { setSelectedProvider(provider); go("provider"); }}
                privacyMode={privacyMode} setPrivacyMode={setPrivacyMode} online={online} setOnline={setOnline}
                pin={pin} setPin={setPin} interests={interests} setInterests={setInterests}
                cartCount={cartCount} setCartCount={setCartCount} announce={announce}
                dangerOpen={dangerOpen} setDangerOpen={setDangerOpen}
                sharingActive={sharingActive} setSharingActive={setSharingActive}
                symptomSaved={symptomSaved} saveSymptom={saveSymptom}
              />}
            </main>
            {showAppChrome && <BottomNav current={screen} go={go} t={t} />}
          </div>
        </div>
      ) : (
        <Portal key={workspace} workspace={workspace} t={t} language={language} announce={announce} onExit={() => { setWorkspace("patient"); setScreen("home"); announce(t("portal.signout")); }} />
      )}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div>}
    </div>
  );
}

function DemoBar({ workspace, setWorkspace, onAccess, language, setLanguage, theme, setTheme, t, portalTitle }: {
  workspace: Workspace; setWorkspace: (value: Workspace) => void; onAccess: () => void; language: Language; setLanguage: (value: Language) => void; theme: Theme; setTheme: (value: Theme) => void; t: T; portalTitle: MessageKey;
}) {
  const nextTheme: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : MonitorCog;
  return (
    <header className="demo-bar">
      <div className="demo-brand"><BrandMark small /><span><strong>MWANAMKE</strong><small>{t("common.demo")}</small></span></div>
      <div className="demo-controls">
        <label className="workspace-switch">
          <span className="sr-only">{t("admin.switch")}</span>
          <ShieldCheck size={16}/>
          <select value={workspace} onChange={(event) => setWorkspace(event.target.value as Workspace)} aria-label={t("admin.switch")}>
            <option value="patient">{t("portal.patient")}</option>
            <option value="provider">{t("portal.provider")}</option>
            <option value="navigator">{t("portal.navigator")}</option>
            <option value="admin">{t("portal.admin")}</option>
          </select>
        </label>
        <span className="current-workspace">{t(portalTitle)}</span>
        <div className="utility-actions">
          <button className="theme-toggle" onClick={onAccess} aria-label={language === "sw" ? "Ingia" : "Access"}><KeyRound size={16}/><span>{language === "sw" ? "Ingia" : "Access"}</span></button>
          <button className="theme-toggle" onClick={() => setTheme(nextTheme[theme])} aria-label={language === "sw" ? `Mandhari: ${theme}` : `Theme: ${theme}`}><ThemeIcon size={16}/><span>{theme === "system" ? "Auto" : theme === "light" ? (language === "sw" ? "Nuru" : "Light") : (language === "sw" ? "Giza" : "Dark")}</span></button>
          <button className="language-toggle" aria-label={t("profile.language")} onClick={() => setLanguage(language === "sw" ? "en" : "sw")}><Languages size={16}/><span>{language === "sw" ? "EN" : "SW"}</span></button>
        </div>
      </div>
    </header>
  );
}

function BrandMark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true"><span>M</span></span>;
}

function DesktopRail({ current, go, t, privacyMode }: { current: Screen; go: (screen: Screen) => void; t: T; privacyMode: boolean }) {
  const items: Array<[Screen, LucideIcon, MessageKey]> = [
    ["home", Home, "nav.home"], ["care", HeartHandshake, "nav.care"], ["appointments", CalendarDays, "nav.appointments"],
    ["essentials", ShoppingBag, "nav.essentials"], ["profile", CircleUserRound, "nav.profile"]
  ];
  return (
    <aside className="desktop-rail">
      <p className="rail-label">{t("portal.patient")}</p>
      <nav aria-label="Primary navigation">
        {items.map(([target, Icon, key]) => <button key={target} className={current === target ? "active" : ""} onClick={() => go(target)}><Icon size={21}/><span>{t(key)}</span></button>)}
      </nav>
      <div className="rail-trust"><ShieldCheck size={22}/><div><strong>{t("home.privacyOn")}</strong><small>{privacyMode ? t("privacy.serverCannotItems") : t("privacy.control")}</small></div></div>
      <button className="rail-support" onClick={() => go("safety")}><Shield size={18}/>{t("safety.entry")}</button>
    </aside>
  );
}

function MobileHeader({ screen, go, t, online, privacyMode, setPrivacyMode }: {
  screen: Screen; go: (screen: Screen) => void; t: T; online: boolean; privacyMode: boolean; setPrivacyMode: (value: boolean) => void;
}) {
  const isMain = mainScreens.includes(screen);
  return (
    <header className="mobile-header">
      <div className="header-left">
        {!isMain && <button className="icon-button" onClick={() => go(screen === "provider" ? "care" : "home")} aria-label={t("common.back")}><ArrowLeft /></button>}
        <div><span className="eyebrow">{isMain ? t("portal.patient") : t("common.back")}</span><strong>{screenTitles[screen] ? t(screenTitles[screen]!) : t("brand.promise")}</strong></div>
      </div>
      <div className="header-actions">
        <button className={`status-dot ${online ? "online" : "offline"}`} onClick={() => go("offline")} aria-label={online ? t("home.sync") : t("home.offline")}>{online ? <Cloud size={18}/> : <CloudOff size={18}/>}</button>
        <button className={`icon-button ${privacyMode ? "privacy-active" : ""}`} onClick={() => setPrivacyMode(!privacyMode)} aria-label={t("profile.mode")}>{privacyMode ? <EyeOff /> : <Eye />}</button>
      </div>
    </header>
  );
}

function BottomNav({ current, go, t }: { current: Screen; go: (screen: Screen) => void; t: T }) {
  const items: Array<[Screen, LucideIcon, MessageKey]> = [
    ["home", Home, "nav.home"], ["care", HeartHandshake, "nav.care"], ["appointments", CalendarDays, "nav.appointments"],
    ["essentials", ShoppingBag, "nav.essentials"], ["profile", CircleUserRound, "nav.profile"]
  ];
  return <nav className="bottom-nav" aria-label="Primary navigation">{items.map(([target, Icon, key]) => <button key={target} className={current === target ? "active" : ""} onClick={() => go(target)}><Icon/><span>{t(key)}</span></button>)}</nav>;
}

type PatientScreenProps = {
  screen: Screen; language: Language; setLanguage: (language: Language) => void; go: (screen: Screen) => void; t: T;
  provider: Provider; selectProvider: (provider: Provider) => void; privacyMode: boolean; setPrivacyMode: (value: boolean) => void;
  online: boolean; setOnline: (value: boolean) => void; pin: string; setPin: (value: string) => void;
  interests: string[]; setInterests: (items: string[]) => void; cartCount: number; setCartCount: (value: number) => void;
  announce: (message: string) => void; dangerOpen: boolean; setDangerOpen: (value: boolean) => void;
  sharingActive: boolean; setSharingActive: (value: boolean) => void; symptomSaved: boolean; saveSymptom: () => Promise<void>;
};

function AccessScreen({ language, reviewMode, enter }: { language: Language; reviewMode: boolean; enter: (role: Workspace, intent: "signin" | "signup") => void }) {
  const sw = language === "sw";
  const roles: Array<{ role: Workspace; icon: LucideIcon; title: string; body: string; action: string; selfServe: boolean }> = [
    { role: "patient", icon: Heart, title: sw ? "Mwanamke / mgonjwa" : "Patient", body: sw ? "Jisajili au ingia ili kuhifadhi taarifa zilizosimbwa kwenye vifaa unavyoamini." : "Create an account or sign in to sync encrypted records across trusted devices.", action: sw ? "Ingia kama mgonjwa" : "Patient sign in", selfServe: true },
    { role: "provider", icon: Stethoscope, title: sw ? "Mtoa huduma" : "Provider", body: sw ? "Akaunti huwezeshwa baada ya utambulisho, leseni na kituo kuhakikiwa." : "Access is activated only after identity, licence and facility verification.", action: sw ? "Ingia kama mtoa huduma" : "Provider sign in", selfServe: false },
    { role: "navigator", icon: HeartHandshake, title: sw ? "Mratibu wa huduma" : "Care navigator", body: sw ? "Kuingia kwa mwaliko wa taasisi; hakuna usajili wa wazi wa jukumu hili." : "Organisation invitation only; this privileged role has no public sign-up.", action: sw ? "Ingia kwa mwaliko" : "Invitation sign in", selfServe: false },
    { role: "admin", icon: MonitorCog, title: sw ? "Msimamizi" : "Administrator", body: sw ? "SSO ya wafanyakazi, MFA na jukumu lililotolewa na jukwaa vinahitajika." : "Workforce SSO, MFA and a platform-issued role are required.", action: sw ? "Ingia kupitia SSO" : "Admin SSO", selfServe: false }
  ];
  return <section className="access-screen">
    <header className="access-heading"><div><BrandMark/><span>MWANAMKE</span></div><p className="overline">{sw ? "UTAMBULISHO SALAMA" : "SECURE IDENTITY"}</p><h1>{sw ? "Ingia kwenye sehemu yako" : "Enter the right workspace"}</h1><p>{sw ? "Jukumu hutoka kwa mtoa utambulisho na huthibitishwa tena na hifadhidata — haliwezi kuchaguliwa baada ya kuingia." : "Your role comes from the identity provider and is checked again in the database — it cannot be selected after sign-in."}</p></header>
    <div className="access-grid">{roles.map(({ role, icon: Icon, title, body, action, selfServe }) => <article className="access-card" key={role}>
      <span className={`round-icon ${role === "admin" ? "navy" : role === "provider" ? "lavender" : role === "navigator" ? "coral" : "teal"}`}><Icon/></span>
      <div><h2>{title}</h2><p>{body}</p></div>
      <button className="button primary full" onClick={() => enter(role, "signin")}><LockKeyhole/>{action}</button>
      {selfServe ? <button className="button ghost full" onClick={() => enter("patient", "signup")}><Plus/>{sw ? "Fungua akaunti mpya" : "Create patient account"}</button> : <span className="access-policy"><ShieldCheck/>{sw ? "Imethibitishwa / kwa mwaliko" : "Verified or invitation-only"}</span>}
    </article>)}</div>
    <div className="access-assurance"><ShieldCheck/><div><strong>{sw ? "Hakuna nywila zinazohifadhiwa hapa" : "No passwords are stored by MWANAMKE"}</strong><p>{reviewMode ? (sw ? "Mazingira haya ya ndani ni ya ukaguzi tu na yana taarifa za mfano." : "This local review surface uses fictional data only.") : (sw ? "Utambulisho wa uzalishaji hutumia OIDC Authorization Code + PKCE kupitia mtoa utambulisho aliyeidhinishwa." : "Production identity uses OIDC Authorization Code + PKCE through the approved identity provider.")}</p></div></div>
  </section>;
}

function PatientScreen(props: PatientScreenProps) {
  const { screen } = props;
  if (screen === "language") return <LanguageScreen {...props} />;
  if (screen.startsWith("intro")) return <IntroScreen {...props} />;
  if (screen === "privacy") return <PrivacyIntro {...props} />;
  if (screen === "account") return <AccountScreen {...props} />;
  if (screen === "pin") return <PinScreen {...props} />;
  if (screen === "recovery") return <RecoveryScreen {...props} />;
  if (screen === "interests") return <InterestsScreen {...props} />;
  if (screen === "home") return <HomeScreen {...props} />;
  if (screen === "care") return <CareScreen {...props} />;
  if (screen === "provider") return <ProviderScreen {...props} />;
  if (screen === "booking") return <BookingScreen {...props} />;
  if (screen === "payment") return <PaymentScreen {...props} />;
  if (screen === "confirmation") return <ConfirmationScreen {...props} />;
  if (screen === "appointments") return <AppointmentsScreen {...props} />;
  if (screen === "waiting") return <WaitingRoom {...props} />;
  if (screen === "health") return <HealthHub {...props} />;
  if (screen === "cycle") return <CycleScreen {...props} />;
  if (screen === "symptom") return <SymptomScreen {...props} />;
  if (screen === "pregnancy") return <PregnancyScreen {...props} />;
  if (screen === "postpartum") return <PostpartumScreen {...props} />;
  if (screen === "wellbeing") return <WellbeingScreen {...props} />;
  if (screen === "navigator") return <NavigatorChat {...props} />;
  if (screen === "labs") return <LabsScreen {...props} />;
  if (screen === "labStatus") return <LabStatus {...props} />;
  if (screen === "result") return <ResultViewer {...props} />;
  if (screen === "pharmacy") return <PharmacyScreen {...props} />;
  if (screen === "essentials") return <EssentialsScreen {...props} />;
  if (screen === "cart") return <CartScreen {...props} />;
  if (screen === "safety") return <SafetyScreen {...props} />;
  if (screen === "contacts") return <TrustedContacts {...props} />;
  if (screen === "checkin") return <SafetyCheckin {...props} />;
  if (screen === "support") return <SupportDirectory {...props} />;
  if (screen === "wallet") return <WalletScreen {...props} />;
  if (screen === "sharing") return <SharingScreen {...props} />;
  if (screen === "history") return <HistoryScreen {...props} />;
  if (screen === "profile") return <ProfileScreen {...props} />;
  if (screen === "privacyCentre") return <PrivacyCentre {...props} />;
  if (screen === "notifications") return <NotificationScreen {...props} />;
  if (screen === "languageSettings") return <LanguageSettings {...props} />;
  if (screen === "devices") return <DevicesScreen {...props} />;
  if (screen === "offline") return <OfflineScreen {...props} />;
  return <EmptyScreen {...props} />;
}

function OnboardingFrame({ step, children, t, back, next, nextDisabled = false, nextLabel }: {
  step: number; children: React.ReactNode; t: T; back?: () => void; next: () => void; nextDisabled?: boolean; nextLabel?: string;
}) {
  return (
    <section className="onboarding-frame">
      <div className="onboarding-top"><BrandMark/><span className="onboarding-brand">MWANAMKE</span><span className="step-count">{String(step).padStart(2, "0")} / 09</span></div>
      <div className="progress-track"><span style={{ width: `${(step / 9) * 100}%` }}/></div>
      <div className="onboarding-body">{children}</div>
      <div className="onboarding-actions">{back ? <button className="button ghost" onClick={back}><ArrowLeft size={18}/>{t("common.back")}</button> : <span/>}<button className="button primary" disabled={nextDisabled} onClick={next}>{nextLabel ?? t("common.continue")}<ArrowRight size={18}/></button></div>
    </section>
  );
}

function LanguageScreen({ language, setLanguage, go, t }: PatientScreenProps) {
  return <OnboardingFrame step={1} t={t} next={() => go("intro1")}><div className="onboarding-illustration language-art"><Globe2/><span>Karibu</span></div><p className="overline">MWANAMKE</p><h1>{t("language.title")}</h1><p className="lead">{t("language.subtitle")}</p><div className="language-cards"><button className={language === "sw" ? "selected" : ""} onClick={() => setLanguage("sw")}><span className="language-code">SW</span><span><strong>Kiswahili</strong><small>Endelea kwa Kiswahili</small></span><Check/></button><button className={language === "en" ? "selected" : ""} onClick={() => setLanguage("en")}><span className="language-code">EN</span><span><strong>English</strong><small>Continue in English</small></span><Check/></button></div></OnboardingFrame>;
}

function IntroScreen({ screen, go, t }: PatientScreenProps) {
  const index = screen === "intro1" ? 1 : screen === "intro2" ? 2 : 3;
  const content = index === 1 ? ["intro.one.title", "intro.one.body", HeartHandshake] as const : index === 2 ? ["intro.two.title", "intro.two.body", LockKeyhole] as const : ["intro.three.title", "intro.three.body", BookHeart] as const;
  const Icon = content[2];
  return <OnboardingFrame step={index + 1} t={t} back={() => go(index === 1 ? "language" : index === 2 ? "intro1" : "intro2")} next={() => go(index === 1 ? "intro2" : index === 2 ? "intro3" : "privacy")}><div className={`onboarding-illustration intro-art art-${index}`}><div className="art-orbit"><Icon/></div><span className="art-card one"><CheckCircle2/> {index === 1 ? "Imethibitishwa" : index === 2 ? "Imefungwa" : "Msaada halisi"}</span><span className="art-card two"><ShieldCheck/> {index === 1 ? "Bei wazi" : index === 2 ? "Kifaa chako" : "Hatua wazi"}</span></div><p className="overline">0{index} · MWANAMKE</p><h1>{t(content[0])}</h1><p className="lead">{t(content[1])}</p><div className="dot-progress"><span className={index === 1 ? "active" : ""}/><span className={index === 2 ? "active" : ""}/><span className={index === 3 ? "active" : ""}/></div></OnboardingFrame>;
}

function PrivacyIntro({ go, t }: PatientScreenProps) {
  return <OnboardingFrame step={5} t={t} back={() => go("intro3")} next={() => go("account")}><div className="privacy-hero"><div className="privacy-lock"><LockKeyhole/></div><div><p className="overline">{t("privacy.control")}</p><h1>{t("privacy.title")}</h1></div></div><p className="lead compact">{t("privacy.body")}</p><div className="privacy-compare"><div><span className="compare-icon can"><Eye/></span><p><strong>{t("privacy.serverCan")}</strong><small>{t("privacy.serverCanItems")}</small></p></div><div><span className="compare-icon cannot"><EyeOff/></span><p><strong>{t("privacy.serverCannot")}</strong><small>{t("privacy.serverCannotItems")}</small></p></div></div></OnboardingFrame>;
}

function AccountScreen({ go, t }: PatientScreenProps) {
  const [accountMode, setAccountMode] = useState<"private" | "account">("private");
  return <OnboardingFrame step={6} t={t} back={() => go("privacy")} next={() => go("pin")}><p className="overline">{t("common.optional")}</p><h1>{t("account.title")}</h1><div className="choice-stack"><button className={`choice-card ${accountMode === "private" ? "selected" : ""}`} onClick={() => setAccountMode("private")} aria-pressed={accountMode === "private"}><span className="choice-icon"><Smartphone/></span><span><strong>{t("account.private")}</strong><small>{t("account.privateHelp")}</small></span><span className="radio-dot"/></button><button className={`choice-card ${accountMode === "account" ? "selected" : ""}`} onClick={() => setAccountMode("account")} aria-pressed={accountMode === "account"}><span className="choice-icon lavender"><Cloud/></span><span><strong>{t("account.create")}</strong><small>{t("account.createHelp")}</small></span><span className="radio-dot"/></button></div><div className="trust-note"><ShieldCheck/><span>{t("privacy.serverCannotItems")}</span></div></OnboardingFrame>;
}

function PinScreen({ go, t, pin, setPin }: PatientScreenProps) {
  return <OnboardingFrame step={7} t={t} back={() => go("account")} next={() => go("recovery")} nextDisabled={pin.length !== 6}><div className="onboarding-illustration pin-art"><Fingerprint/></div><h1>{t("pin.title")}</h1><p className="lead compact">{t("pin.body")}</p><label className="pin-label"><span>{t("pin.label")}</span><input value={pin} inputMode="numeric" autoComplete="new-password" maxLength={6} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} aria-describedby="pin-help"/><div className="pin-dots">{Array.from({ length: 6 }).map((_, index) => <span key={index} className={pin.length > index ? "filled" : ""}/>)}</div></label><p id="pin-help" className="microcopy"><Shield/> {t("account.privateHelp")}</p></OnboardingFrame>;
}

function RecoveryScreen({ go, t, announce }: PatientScreenProps) {
  const recoveryKey = "LOCAL REVIEW — NO RECOVERY CREDENTIAL";
  const [confirmed, setConfirmed] = useState(false);
  return <OnboardingFrame step={8} t={t} back={() => go("pin")} next={() => go("interests")} nextDisabled={!confirmed}><div className="recovery-heading"><span className="choice-icon"><KeyRound/></span><div><h1>{t("recovery.title")}</h1><p className="lead compact">{t("recovery.body")}</p></div></div><div className="recovery-key"><span>{recoveryKey}</span><button onClick={() => { void navigator.clipboard?.writeText(recoveryKey); announce(t("recovery.copy")); }}><FileKey2/>{t("recovery.copy")}</button></div><div className="warning-note"><AlertTriangle/><span>{t("recovery.warning")}</span></div><label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/><span>{t("recovery.confirm")}</span></label></OnboardingFrame>;
}

function InterestsScreen({ go, t, interests, setInterests }: PatientScreenProps) {
  const options: Array<[string, MessageKey, LucideIcon]> = [["menstrual", "interest.menstrual", Droplets], ["pregnancy", "interest.pregnancy", Heart], ["postpartum", "interest.postpartum", HeartHandshake], ["fertility", "interest.fertility", Sparkles], ["contraception", "interest.contraception", Shield], ["mental", "interest.mental", Activity], ["general", "interest.general", Stethoscope], ["menopause", "interest.menopause", CalendarDays], ["safety", "interest.safety", ShieldCheck]];
  const toggle = (id: string) => setInterests(interests.includes(id) ? interests.filter((item) => item !== id) : [...interests, id]);
  return <OnboardingFrame step={9} t={t} back={() => go("recovery")} next={() => go("home")} nextLabel={interests.length ? t("common.continue") : t("interests.skip")}><h1>{t("interests.title")}</h1><p className="lead compact">{t("interests.body")}</p><div className="interest-grid">{options.map(([id, key, Icon]) => <button key={id} className={interests.includes(id) ? "selected" : ""} onClick={() => toggle(id)}><Icon/><span>{t(key)}</span>{interests.includes(id) && <Check className="selected-check"/>}</button>)}</div></OnboardingFrame>;
}

function HomeScreen({ go, t, privacyMode, online, announce }: PatientScreenProps) {
  const [reminderDone, setReminderDone] = useState(false);
  return <div className="screen home-screen"><section className="home-greeting"><div><p className="overline">{privacyMode ? t("home.privateGreeting") : t("home.greeting")}, Amina</p><h1>{t("home.subtitle")}</h1></div><span className={`privacy-chip ${privacyMode ? "active" : ""}`}><EyeOff/>{t("home.privacyOn")}</span></section><button className={`sync-banner ${online ? "synced" : "offline"}`} onClick={() => go("offline")}>{online ? <Cloud/> : <CloudOff/>}<span>{online ? t("home.sync") : t("home.offline")}</span><ChevronRight/></button><button className="next-step-card" onClick={() => go("appointments")}><span className="card-kicker"><span><CalendarDays/>{t("home.nextStep")}</span><span className="status confirmed">{t("appointments.confirmed")}</span></span><span className="card-title">{t("home.appointmentTitle")}</span><span className="card-detail">{privacyMode ? "••••••••••" : "Dkt. Asha Khamis · Bahari Women’s Clinic"}</span><span className="appointment-meta"><Clock3/><span>{t("home.appointmentMeta")}</span></span><span className="card-action">{t("home.viewAll")}<ArrowRight/></span></button><div className="section-heading"><div><p className="overline">{t("home.reminder")}</p><h2>{t("home.supplement")}</h2></div><button onClick={() => go("health")}>{t("home.viewAll")}</button></div><button className={`reminder-row ${reminderDone ? "is-done" : ""}`} aria-label={t("common.done")} aria-pressed={reminderDone} onClick={() => { setReminderDone(!reminderDone); announce(t(reminderDone ? "common.save" : "common.done")); }}><span className="round-icon coral"><Pill/></span><span className="reminder-copy"><strong>{privacyMode ? "••••••••" : t("home.supplement")}</strong><small>{reminderDone ? t("common.done") : t("home.supplementMeta")}</small></span><span className="reminder-check"><Check/></span></button><button className="cycle-card" onClick={() => go("cycle")} aria-label={t("health.cycle")}><span className="cycle-ring"><span>23</span><small>DAY</small></span><span className="cycle-copy"><span className="overline">{t("home.timeline")}</span><strong>{privacyMode ? t("home.timelinePrivate") : t("home.timelineEstimate")}</strong><small>{t("home.estimate")}</small></span><ChevronRight/></button><section className="quick-actions"><button className="quick-card featured" onClick={() => go("navigator")}><span><MessageCircle/></span><strong>{t("home.navigator")}</strong><small>{t("navigator.status")}</small><ArrowRight/></button><button className="quick-card" onClick={() => go("care")}><span><Stethoscope/></span><strong>{t("home.findCare")}</strong><small>{t("care.subtitle")}</small><ArrowRight/></button><button className="quick-card" onClick={() => go("wallet")}><span><LockKeyhole/></span><strong>{t("home.records")}</strong><small>{t("wallet.encrypted")}</small><ArrowRight/></button><button className="quick-card urgent" onClick={() => go("pregnancy")}><span><AlertTriangle/></span><strong>{t("home.urgent")}</strong><small>{t("pregnancy.dangerBody")}</small><ArrowRight/></button></section></div>;
}

function CareScreen({ go, t, language, selectProvider }: PatientScreenProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"female" | "virtual" | "nearby">("female");
  const visibleProviders = providers.filter((provider) => {
    const matchesQuery = `${provider.name} ${provider.specialty[language]} ${provider.facility[language]} ${provider.location[language]}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    const matchesFilter = filter === "female" ? provider.gender === "female" : filter === "virtual" ? provider.modes.includes("virtual") : provider.distanceKm <= 5;
    return matchesQuery && matchesFilter;
  });
  return <div className="screen"><PageIntro eyebrow={t("nav.care")} title={t("care.title")} body={t("care.subtitle")} /><label className="search-box"><Search/><span className="sr-only">{t("care.search")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("care.search")}/>{query && <button type="button" onClick={() => setQuery("")} aria-label={t("common.close")}><X/></button>}</label><div className="filter-row" aria-label={t("care.title")}>{([ ["female", UserRoundCheck, "care.female"], ["virtual", Video, "care.virtual"], ["nearby", MapPin, "care.nearby"] ] as const).map(([id, Icon, key]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)} aria-pressed={filter === id}><Icon/>{t(key)}</button>)}</div><div className="provider-list">{visibleProviders.map((provider) => <ProviderCard key={provider.id} provider={provider} language={language} t={t} onClick={() => selectProvider(provider)}/>)}</div>{visibleProviders.length === 0 && <div className="empty-inline"><Search/><p>{t("empty.body")}</p></div>}<section className="care-services"><h2>{t("health.title")}</h2><div className="service-grid"><ServiceButton icon={Activity} label={t("health.cycle")} onClick={() => go("health")}/><ServiceButton icon={TestTube2} label={t("labs.title")} onClick={() => go("labs")}/><ServiceButton icon={Pill} label={t("pharmacy.title")} onClick={() => go("pharmacy")}/><ServiceButton icon={MessageCircle} label={t("navigator.title")} onClick={() => go("navigator")}/></div></section></div>;
}

function ProviderCard({ provider, language, t, onClick }: { provider: Provider; language: Language; t: T; onClick: () => void }) {
  return <button type="button" className="provider-card" onClick={onClick} aria-label={`${t("care.view")}: ${provider.name}`}><Portrait provider={provider}/><span className="provider-main"><span className="provider-name"><span><strong className="provider-heading">{provider.name}</strong><small>{provider.title[language]}</small></span>{provider.verified && <span className="verified"><BadgeCheck/>{t("care.verified")}</span>}</span><span className="facility"><Building2/>{provider.facility[language]}</span><span className="facility"><MapPin/>{provider.location[language]} · {provider.distanceKm} km</span><span className="provider-bottom"><span><strong>★ {provider.rating}</strong> · {t("care.next")} {provider.nextSlot}</span><strong>{t("care.from")} TZS {provider.priceTzs.toLocaleString()}</strong></span><span className="provider-action">{t("care.view")}<ArrowRight/></span></span></button>;
}

function Portrait({ provider, large = false }: { provider: Provider; large?: boolean }) {
  return <div className={`portrait ${provider.tone} ${large ? "large" : ""}`} role="img" aria-label={`${provider.name}, ${provider.title.en}`}><div className="portrait-hair"/><div className="portrait-face"><span className="portrait-eyes"/></div><div className="portrait-coat"/><span className="portrait-initials">{provider.initials}</span></div>;
}

function ProviderScreen({ provider, language, go, t }: PatientScreenProps) {
  return <div className="screen provider-detail"><section className="provider-hero"><Portrait provider={provider} large/><div><span className="verified"><BadgeCheck/>{t("care.verified")}</span><h1>{provider.name}</h1><p>{provider.title[language]}</p><div className="rating-line"><strong>★ {provider.rating}</strong><span>128 {t("provider.feedback").toLowerCase()}</span></div></div></section><div className="demo-notice"><HelpCircle/>{t("provider.demoNotice")}</div><section className="detail-section"><h2>{t("provider.about")}</h2><p>{provider.specialty[language]}. {provider.verificationNote[language]}</p></section><section className="detail-grid"><InfoCell icon={Building2} label={provider.facility[language]} meta={provider.location[language]}/><InfoCell icon={Languages} label={t("provider.languages")} meta={provider.languages.join(" · ")}/><InfoCell icon={Video} label={t("booking.visit")} meta={provider.modes.map((mode) => t(mode === "physical" ? "booking.physical" : "booking.virtual")).join(" · ")}/><InfoCell icon={UserRoundCheck} label={t("provider.access")} meta={provider.accessibility[language]}/></section><section className="feedback-card"><div><span>“</span><p>{t("provider.feedbackBody")}</p><small>{t("provider.feedback")}</small></div></section><div className="sticky-action"><div><small>{t("care.from")}</small><strong>TZS {provider.priceTzs.toLocaleString()}</strong></div><button className="button primary" onClick={() => go("booking")}>{t("provider.book")}<ArrowRight/></button></div></div>;
}

function BookingScreen({ provider, language, go, t }: PatientScreenProps) {
  const [mode, setMode] = useState<"physical" | "virtual">("physical");
  const [time, setTime] = useState("09:30");
  return <div className="screen"><PageIntro eyebrow={provider.name} title={t("booking.title")} body={provider.facility[language]}/><section className="form-section"><h2>{t("booking.visit")}</h2><div className="segmented"><button className={mode === "physical" ? "active" : ""} onClick={() => setMode("physical")}><Building2/>{t("booking.physical")}</button><button className={mode === "virtual" ? "active" : ""} onClick={() => setMode("virtual")}><Video/>{t("booking.virtual")}</button></div></section><section className="date-card"><CalendarDays/><div><small>{t("booking.date")}</small><strong>{provider.facility[language]}</strong></div></section><section className="form-section"><h2>{t("booking.time")}</h2><div className="time-grid">{["09:30", "10:15", "11:00", "14:30", "15:15"].map((slot) => <button className={time === slot ? "selected" : ""} key={slot} onClick={() => setTime(slot)}>{slot}{time === slot && <Check/>}</button>)}</div></section><section className="price-summary"><div><span>{t("booking.price")}</span><strong>TZS {provider.priceTzs.toLocaleString()}</strong></div><p><ShieldCheck/>{t("booking.feeNote")}</p></section><button className="button primary full" onClick={() => go("payment")}>{t("booking.pay")}<ArrowRight/></button></div>;
}

function PaymentScreen({ provider, go, t }: PatientScreenProps) {
  const [method, setMethod] = useState("mpesa");
  const methods: Array<[string, MessageKey]> = [["mpesa", "payment.mpesa"], ["mixx", "payment.mixx"], ["airtel", "payment.airtel"], ["halopesa", "payment.halopesa"], ["card", "payment.card"], ["sponsor", "payment.sponsor"]];
  return <div className="screen"><PageIntro eyebrow={t("booking.price")} title={t("payment.title")} body={t("payment.mock")}/><section className="payment-total"><span>{t("booking.price")}</span><strong>TZS {provider.priceTzs.toLocaleString()}</strong><small>{provider.name} · {t("booking.date")} · 09:30</small></section><h2 className="section-title">{t("payment.method")}</h2><div className="payment-methods">{methods.map(([id, key]) => <button key={id} className={method === id ? "selected" : ""} onClick={() => setMethod(id)}><span className={`pay-logo ${id}`}>{id === "card" ? <CreditCard/> : id === "sponsor" ? <ShieldCheck/> : id.slice(0, 1).toUpperCase()}</span><strong>{t(key)}</strong><span className="radio-dot"/></button>)}</div><div className="trust-note"><Lock/><span>{t("payment.mock")}</span></div><button className="button primary full" onClick={() => go("confirmation")}>{t("payment.confirm")}<Check/></button></div>;
}

function ConfirmationScreen({ go, t }: PatientScreenProps) {
  return <div className="screen center-screen"><div className="success-orbit"><span><Check/></span></div><p className="overline">{t("appointments.confirmed")}</p><h1>{t("confirmation.title")}</h1><p className="lead compact">{t("confirmation.body")}</p><section className="confirmation-ticket"><div className="ticket-top"><Portrait provider={providers[0]!}/><div><strong>Dkt. Asha Khamis</strong><small>Bahari Women’s Clinic · Demo</small></div></div><div className="ticket-details"><span><CalendarDays/>8 Sep 2026</span><span><Clock3/>09:30</span><span><MapPin/>Mkunazini</span></div><p>{t("confirmation.reference")}</p></section><button className="button primary full" onClick={() => go("home")}>{t("confirmation.home")}<ArrowRight/></button></div>;
}

function AppointmentsScreen({ go, t, language, announce }: PatientScreenProps) {
  const provider = providers.find((item) => item.id === demoAppointment.providerId)!;
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  return <div className="screen"><PageIntro eyebrow={t("nav.appointments")} title={t("appointments.title")}/><div className="tab-row" role="tablist"><button role="tab" aria-selected={tab === "upcoming"} className={tab === "upcoming" ? "active" : ""} onClick={() => setTab("upcoming")}>{t("appointments.upcoming")}<span>1</span></button><button role="tab" aria-selected={tab === "past"} className={tab === "past" ? "active" : ""} onClick={() => setTab("past")}>{t("appointments.past")}</button></div>{tab === "upcoming" ? <article className="appointment-card"><div className="appointment-date"><span>08</span><small>SEP</small></div><div className="appointment-body"><span className="status confirmed">{t("appointments.confirmed")}</span><h2>{t("home.appointmentTitle")}</h2><p>{provider.name}</p><small><Clock3/>09:30 · {t("booking.physical")}</small><small><MapPin/>{provider.location[language]}</small></div><button className="icon-button" onClick={() => announce(t("appointments.title"))} aria-label={t("appointments.title")}><Menu/></button><div className="appointment-actions"><button className="button soft" onClick={() => go("booking")}>{t("appointments.reschedule")}</button><button className="button primary" onClick={() => go("waiting")}>{t("appointments.join")}</button></div></article> : <div className="empty-inline"><History/><p>{t("history.none")}</p></div>}</div>;
}

function WaitingRoom({ go, t }: PatientScreenProps) {
  return <div className="screen center-screen waiting-room"><div className="video-preview"><div className="video-avatar"><Portrait provider={providers[0]!} large/></div><span><CameraOff/>{t("waiting.device")}</span></div><p className="overline">09:30 · DKT. ASHA KHAMIS</p><h1>{t("waiting.title")}</h1><p className="lead compact">{t("waiting.body")}</p><div className="device-check"><span><CameraOff/><Check/></span><span><MicOff/><Check/></span><span><Wifi/><Check/></span></div><button className="button primary full" onClick={() => { go("appointments"); }}>{t("waiting.join")}<Video/></button></div>;
}

function HealthHub({ go, t }: PatientScreenProps) {
  const rows: Array<[Screen, LucideIcon, MessageKey, string]> = [["cycle", Droplets, "health.cycle", "coral"], ["pregnancy", Heart, "health.pregnancy", "teal"], ["postpartum", HeartHandshake, "health.postpartum", "lavender"], ["wellbeing", Activity, "health.wellbeing", "navy"]];
  return <div className="screen"><PageIntro eyebrow={t("nav.care")} title={t("health.title")} body={t("privacy.control")}/><div className="fact-legend"><span><i className="fact"/>{t("health.recorded")}</span><span><i className="estimate"/>{t("health.estimated")}</span><span><i className="advice"/>{t("health.advice")}</span></div><div className="menu-list">{rows.map(([target, Icon, key, tone]) => <MenuRow key={target} icon={Icon} tone={tone} title={t(key)} meta={target === "cycle" ? t("home.timelineEstimate") : target === "pregnancy" ? t("pregnancy.week") : target === "postpartum" ? t("postpartum.day") : t("wellbeing.note")} onClick={() => go(target)}/>)}</div><button className="button outline full" onClick={() => go("symptom")}><Plus/>{t("cycle.add")}</button></div>;
}

function CycleScreen({ go, t }: PatientScreenProps) {
  const days = Array.from({ length: 35 }, (_, index) => index - 1);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(16);
  return <div className="screen"><PageIntro eyebrow={t("health.recorded")} title={t("cycle.title")} body={t("cycle.subtitle")}/><section className="calendar-card"><div className="calendar-title"><button className="icon-button" onClick={() => setMonthOffset(monthOffset - 1)} aria-label={t("common.back")}><ArrowLeft/></button><strong>{monthOffset === 0 ? t("cycle.subtitle") : `${monthOffset > 0 ? "+" : ""}${monthOffset}`}</strong><button className="icon-button" onClick={() => setMonthOffset(monthOffset + 1)} aria-label={t("common.continue")}><ArrowRight/></button></div><div className="weekdays">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="calendar-grid">{days.map((day, index) => <button key={index} disabled={day < 1 || day > 30} onClick={() => setSelectedDay(day)} aria-pressed={selectedDay === day} className={`${day >= 2 && day <= 6 ? "recorded" : day >= 25 && day <= 28 ? "estimated" : day === 16 ? "today" : ""} ${selectedDay === day ? "selected" : ""}`}>{day > 0 && day <= 30 ? day : ""}</button>)}</div><div className="calendar-legend"><span><i className="recorded"/>{t("cycle.recorded")}</span><span><i className="estimated"/>{t("cycle.estimated")}</span></div></section><div className="clinical-note"><HelpCircle/><span>{t("cycle.disclaimer")}</span></div><button className="button primary full" onClick={() => go("symptom")}><Plus/>{t("cycle.add")}</button></div>;
}

function SymptomScreen({ t, saveSymptom, symptomSaved }: PatientScreenProps) {
  const [flow, setFlow] = useState("medium");
  const [pain, setPain] = useState(2);
  const [mood, setMood] = useState("calm");
  return <div className="screen"><PageIntro eyebrow={t("health.recorded")} title={t("symptom.title")} body={t("privacy.control")}/><section className="form-section"><h2>{t("symptom.flow")}</h2><div className="select-pills">{["none", "light", "medium", "heavy"].map((item) => <button key={item} className={flow === item ? "selected" : ""} onClick={() => setFlow(item)}>{t(`symptom.${item}` as MessageKey)}</button>)}</div></section><section className="form-section"><h2>{t("symptom.pain")}</h2><div className="pain-scale">{[0,1,2,3,4,5].map((item) => <button key={item} aria-pressed={pain === item} className={pain === item ? "selected" : ""} onClick={() => setPain(item)}>{item}</button>)}</div></section><section className="form-section"><h2>{t("symptom.mood")}</h2><div className="select-pills">{["calm", "low", "anxious"].map((item) => <button key={item} className={mood === item ? "selected" : ""} onClick={() => setMood(item)}>{t(`symptom.${item}` as MessageKey)}</button>)}</div></section><label className="text-field"><span>{t("symptom.notes")} · {t("common.optional")}</span><textarea rows={3} placeholder="••••••••••"/></label><div className="encryption-line"><LockKeyhole/><span>{t("wallet.encrypted")}</span></div><button className="button primary full" onClick={() => void saveSymptom()}>{symptomSaved ? <CheckCircle2/> : <Lock/>}{symptomSaved ? t("symptom.saved") : t("symptom.save")}</button></div>;
}

function PregnancyScreen({ go, t, dangerOpen, setDangerOpen }: PatientScreenProps) {
  return <div className="screen"><section className="pregnancy-hero"><div className="pregnancy-copy"><p className="overline">{t("health.estimated")}</p><h1>{t("pregnancy.week")}</h1><p>{t("pregnancy.estimate")}</p><small>{t("pregnancy.estimateNote")}</small></div><div className="progress-bloom"><span>60%</span><Heart/></div></section><div className="timeline-list"><TimelineRow done title="Booking visit" meta="Completed · 18 Apr"/><TimelineRow done title="Antenatal check" meta="Completed · 22 Aug"/><TimelineRow current title={t("pregnancy.next")} meta="8 Sep · 09:30"/><TimelineRow title={t("pregnancy.checklist")} meta="6 of 10 ready"/></div><section className="facility-card"><span className="round-icon teal"><Building2/></span><div><small>{t("pregnancy.facility")}</small><strong>Bahari Women’s Clinic · Demo</strong><p>Mkunazini, Zanzibar City</p></div><ChevronRight/></section><button className="danger-button" onClick={() => setDangerOpen(true)}><AlertTriangle/><span><strong>{t("pregnancy.danger")}</strong><small>{t("pregnancy.dangerBody")}</small></span><ChevronRight/></button><div className="bloodmatch-boundary"><ShieldCheck/><span>{t("pregnancy.bloodmatch")}</span></div>{dangerOpen && <div className="danger-sheet" role="alertdialog" aria-modal="true" aria-labelledby="danger-title"><button className="sheet-close" onClick={() => setDangerOpen(false)} aria-label={t("common.close")}><X/></button><AlertTriangle className="danger-icon"/><h2 id="danger-title">{t("pregnancy.dangerTitle")}</h2><p>{t("pregnancy.dangerBody")}</p><button className="button danger full" onClick={() => window.location.href = "tel:112"}>{t("pregnancy.call")}</button><button className="button outline full" onClick={() => go("navigator")}>{t("pregnancy.referral")}</button></div>}</div>;
}

function PostpartumScreen({ t, announce }: PatientScreenProps) {
  return <div className="screen"><section className="postpartum-hero"><span><HeartHandshake/></span><div><p className="overline">{t("postpartum.day")}</p><h1>{t("postpartum.title")}</h1><p>{t("postpartum.check")}</p></div></section><div className="care-plan-progress"><div><span>{t("pregnancy.checklist")}</span><strong>4 / 6</strong></div><span><i style={{ width: "66%" }}/></span></div><div className="menu-list"><MenuRow icon={ClipboardCheck} tone="teal" title={t("postpartum.recovery")} meta={t("postpartum.check")} onClick={() => announce(t("common.save"))}/><MenuRow icon={Heart} tone="coral" title={t("postpartum.feeding")} meta="Kesho · 10:00" onClick={() => announce(t("common.save"))}/><MenuRow icon={Activity} tone="lavender" title={t("wellbeing.title")} meta={t("wellbeing.note")} onClick={() => announce(t("common.save"))}/></div><div className="clinical-note"><Stethoscope/><span>{t("pregnancy.dangerBody")}</span></div></div>;
}

function WellbeingScreen({ t, announce }: PatientScreenProps) {
  const [answer, setAnswer] = useState<string | null>(null);
  const options: MessageKey[] = ["wellbeing.notAtAll", "wellbeing.several", "wellbeing.more", "wellbeing.nearly"];
  return <div className="screen"><div className="wellbeing-icon"><Activity/></div><PageIntro eyebrow={t("health.recorded")} title={t("wellbeing.title")} body={t("wellbeing.question")}/><div className="answer-stack">{options.map((key) => <button key={key} className={answer === key ? "selected" : ""} onClick={() => setAnswer(key)}><span>{t(key)}</span>{answer === key ? <CheckCircle2/> : <span className="radio-dot"/>}</button>)}</div><div className="clinical-note"><HelpCircle/><span>{t("wellbeing.note")}</span></div><button className="button primary full" disabled={!answer} onClick={() => announce(t("symptom.saved"))}><Lock/>{t("symptom.save")}</button></div>;
}

function NavigatorChat({ t, announce }: PatientScreenProps) {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const send = () => { if (!message.trim()) return; setSent(true); setMessage(""); announce(t("navigator.sent")); };
  return <div className="screen chat-screen"><section className="navigator-profile"><span className="navigator-avatar">ZN</span><div><h1>Zawadi · Care navigator</h1><p><i/>{t("navigator.status")}</p></div><button className="icon-button" onClick={() => announce(t("navigator.privacy"))} aria-label={t("navigator.privacy")}><Lock/></button></section><div className="encrypted-banner"><LockKeyhole/>{t("navigator.privacy")}</div><div className="chat-thread"><span className="chat-day">05 SEP</span><div className="message received">{t("navigator.message1")}<small>10:42</small></div>{sent && <div className="message sent">{languageSafe(t("navigator.quick1"))}<small><Check/>10:44</small></div>}</div><div className="quick-replies"><button onClick={() => setMessage(t("navigator.quick1"))}>{t("navigator.quick1")}</button><button onClick={() => setMessage(t("navigator.quick2"))}>{t("navigator.quick2")}</button></div><div className="composer"><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("navigator.placeholder")} aria-label={t("navigator.placeholder")} onKeyDown={(event) => { if (event.key === "Enter") send(); }}/><button onClick={send} disabled={!message.trim()} aria-label={t("navigator.send")}><Send/></button></div></div>;
}

function languageSafe(value: string) { return value; }

function LabsScreen({ go, t }: PatientScreenProps) {
  return <div className="screen"><PageIntro eyebrow={t("nav.care")} title={t("labs.title")} body={t("labs.review")}/><div className="lab-list"><article><span className="round-icon teal"><TestTube2/></span><div><h2>{t("labs.cbc")}</h2><p>{t("labs.home")}</p><small>{t("labs.price")}</small></div><strong>TZS 18,000</strong><button className="button outline" onClick={() => go("labStatus")}>{t("labs.book")}</button></article><article><span className="round-icon lavender"><FlaskConical/></span><div><h2>{t("labs.urine")}</h2><p>Bahari Lab · Demo</p><small>{t("labs.price")}</small></div><strong>TZS 12,000</strong><button className="button outline" onClick={() => go("labStatus")}>{t("labs.book")}</button></article></div></div>;
}

function LabStatus({ go, t }: PatientScreenProps) {
  return <div className="screen"><PageIntro eyebrow="LAB-2091" title={t("labs.statusTitle")} body={t("labs.cbc")}/><div className="order-progress"><TimelineRow done title={t("labs.book")} meta="2 Sep · 08:14"/><TimelineRow done title={t("labs.home")} meta="3 Sep · 07:30"/><TimelineRow done current title={t("labs.status")} meta="5 Sep · 10:02"/></div><section className="encrypted-result-card"><div className="document-preview"><FileText/><span>••••••••••</span></div><div><span className="status confirmed">{t("wallet.encrypted")}</span><h2>{t("labs.cbc")}</h2><p>{t("labs.review")}</p><button className="button primary" onClick={() => go("result")}>{t("labs.result")}<LockKeyhole/></button></div></section></div>;
}

function ResultViewer({ t, announce }: PatientScreenProps) {
  const [unlocked, setUnlocked] = useState(false);
  return <div className="screen"><PageIntro eyebrow={t("wallet.encrypted")} title={t("labs.viewer")} body={t("labs.review")}/>{!unlocked ? <section className="locked-view"><LockKeyhole/><h2>{t("labs.cbc")}</h2><p>{t("privacy.control")}</p><button className="button primary" onClick={() => setUnlocked(true)}><Fingerprint/>{t("labs.unlock")}</button></section> : <section className="result-sheet"><div className="result-heading"><FileHeart/><div><h2>{t("labs.cbc")}</h2><p>Bahari Lab · Demo · 5 Sep 2026</p></div></div><div className="result-row"><span>Haemoglobin</span><strong>12.4 g/dL</strong><small>Recorded result</small></div><div className="result-row"><span>Platelets</span><strong>248 ×10⁹/L</strong><small>Recorded result</small></div><div className="clinical-note"><Stethoscope/><span>{t("labs.review")}</span></div><button className="button outline full" onClick={() => announce(t("sharing.title"))}><ShieldCheck/>{t("sharing.title")}</button></section>}</div>;
}

function PharmacyScreen({ t, announce }: PatientScreenProps) {
  return <div className="screen"><PageIntro eyebrow={t("nav.care")} title={t("pharmacy.title")} body={t("pharmacy.valid")}/><section className="upload-card"><span className="upload-icon"><FileKey2/></span><h2>{t("pharmacy.upload")}</h2><p>{t("wallet.subtitle")}</p><button className="button primary" onClick={() => announce(t("pharmacy.status"))}><Plus/>{t("wallet.add")}</button></section><button className="pharmacy-status" onClick={() => announce(t("pharmacy.status"))}><span className="round-icon lavender"><Pill/></span><span><span className="status pending">{t("status.pending")}</span><strong>MW-RX-0182</strong><small>{t("pharmacy.status")}</small></span><ChevronRight/></button></div>;
}

function EssentialsScreen({ language, go, t, cartCount, setCartCount, announce }: PatientScreenProps) {
  const [category, setCategory] = useState<"all" | "menstrual" | "postpartum">("all");
  const visibleProducts = products.filter((product) => category === "all" || (category === "menstrual" ? product.id === "prod-pads" : product.id === "prod-postpartum"));
  return <div className="screen"><div className="market-heading"><PageIntro eyebrow={t("nav.essentials")} title={t("essentials.title")} body={t("essentials.subtitle")}/><button className="cart-button" onClick={() => go("cart")} aria-label={t("essentials.cart")}><ShoppingBag/><span>{cartCount}</span></button></div><div className="category-pills">{([ ["all", "essentials.title"], ["menstrual", "interest.menstrual"], ["postpartum", "interest.postpartum"] ] as const).map(([id, key]) => <button key={id} className={category === id ? "active" : ""} onClick={() => setCategory(id)} aria-pressed={category === id}>{t(key)}</button>)}</div><div className="product-grid">{visibleProducts.map((product) => <article key={product.id} className="product-card"><div className={`product-art ${product.icon}`}><ProductIcon icon={product.icon}/>{product.badge && <span>{product.badge[language]}</span>}</div><p>{product.category[language]}</p><h2>{product.name[language]}</h2><small>{product.unit[language]}</small><div><strong>TZS {product.priceTzs.toLocaleString()}</strong><button aria-label={`${t("essentials.add")} · ${product.name[language]}`} onClick={() => { setCartCount(cartCount + 1); announce(t("essentials.add")); }}><Plus/><span>{t("essentials.add")}</span></button></div></article>)}</div>{cartCount > 0 && <button className="floating-cart" onClick={() => go("cart")}><ShoppingBag/><span>{t("essentials.cart")} · {cartCount}</span><strong>TZS {(cartCount * 4800).toLocaleString()}</strong></button>}</div>;
}

function ProductIcon({ icon }: { icon: "drop" | "heart" | "shield" | "bag" }) { return icon === "drop" ? <Droplets/> : icon === "heart" ? <Heart/> : icon === "shield" ? <Shield/> : <ShoppingBag/>; }

function CartScreen({ go, t, language, cartCount, setCartCount, announce }: PatientScreenProps) {
  const count = Math.max(1, cartCount);
  return <div className="screen"><PageIntro eyebrow={t("nav.essentials")} title={t("essentials.checkout")}/><article className="cart-item"><div className="product-art drop"><Droplets/></div><div><h2>{products[0]!.name[language]}</h2><p>{products[0]!.unit[language]}</p><span className="quantity"><button onClick={() => setCartCount(Math.max(1, count - 1))} aria-label={t("common.back")}>−</button><strong>{count}</strong><button onClick={() => setCartCount(count + 1)} aria-label={t("essentials.add")}>+</button></span></div><strong>TZS {(4800 * count).toLocaleString()}</strong></article><button className="delivery-card" onClick={() => announce(t("essentials.delivery"))}><MapPin/><div><small>{t("essentials.delivery")}</small><strong>Mkunazini, Zanzibar City</strong><p>Estimated 1–2 days · TZS 2,500</p></div><ChevronRight/></button><section className="cart-summary"><div><span>{t("essentials.cart")}</span><strong>TZS {(4800 * count).toLocaleString()}</strong></div><div><span>{t("essentials.delivery")}</span><strong>TZS 2,500</strong></div><div className="total"><span>{t("essentials.total")}</span><strong>TZS {(4800 * count + 2500).toLocaleString()}</strong></div></section><button className="button primary full" onClick={() => { setCartCount(0); announce(t("common.done")); go("essentials"); }}>{t("essentials.place")}<PackageCheck/></button></div>;
}

function SafetyScreen({ go, t, announce }: PatientScreenProps) {
  return <div className="screen safety-screen"><div className="safety-header"><div><p className="overline">{t("safety.entry")}</p><h1>{t("safety.title")}</h1><p>{t("safety.subtitle")}</p></div><button className="quick-exit" onClick={() => go("home")}><X/>{t("safety.exit")}</button></div><button className="lock-now" onClick={() => go("pin")}><Lock/><span><strong>{t("safety.lock")}</strong><small>{t("profile.mode")}</small></span><ChevronRight/></button><div className="safety-grid"><ServiceButton icon={UsersRound} label={t("safety.contacts")} onClick={() => go("contacts")}/><ServiceButton icon={Clock3} label={t("safety.checkin")} onClick={() => go("checkin")}/><ServiceButton icon={HeartHandshake} label={t("safety.support")} onClick={() => go("support")}/><ServiceButton icon={Smartphone} label={t("safety.digital")} onClick={() => announce(t("safety.noRecording"))}/><ServiceButton icon={FileKey2} label={t("safety.notes")} onClick={() => go("wallet")}/><ServiceButton icon={Trash2} label={t("safety.clear")} onClick={() => announce(t("common.done"))}/></div><div className="safety-disclaimer"><AlertTriangle/><div><strong>{t("safety.noPromise")}</strong><p>{t("safety.noRecording")}</p></div></div></div>;
}

function TrustedContacts({ t, announce }: PatientScreenProps) {
  return <div className="screen"><PageIntro eyebrow={t("safety.entry")} title={t("safety.contactTitle")} body={t("privacy.control")}/><div className="contact-list"><article><span className="contact-avatar">FM</span><div><h2>Fatma M.</h2><p>+255 ••• ••• 281</p><small><ShieldCheck/>{t("status.active")}</small></div><button className="icon-button" onClick={() => announce(t("safety.contacts"))} aria-label={t("safety.contacts")}><Menu/></button></article></div><button className="button primary full" onClick={() => announce(t("safety.addContact"))}><Plus/>{t("safety.addContact")}</button><div className="clinical-note"><Lock/><span>{t("safety.sms")}</span></div></div>;
}

function SafetyCheckin({ t, announce }: PatientScreenProps) {
  const [duration, setDuration] = useState("30");
  return <div className="screen center-screen"><div className="checkin-clock"><Clock3/></div><PageIntro eyebrow={t("safety.entry")} title={t("safety.checkTitle")} body={t("safety.sms")}/><h2 className="section-title">{t("safety.duration")}</h2><div className="time-grid">{["15", "30", "60", "120"].map((value) => <button key={value} className={duration === value ? "selected" : ""} onClick={() => setDuration(value)}>{value} min</button>)}</div><div className="privacy-compare compact"><div><span className="compare-icon can"><UsersRound/></span><p><strong>Fatma M.</strong><small>{t("safety.contacts")}</small></p></div><div><span className="compare-icon cannot"><MapPin/></span><p><strong>{t("common.optional")}</strong><small>{t("safety.noRecording")}</small></p></div></div><button className="button primary full" onClick={() => announce(t("status.active"))}><ShieldCheck/>{t("safety.start")}</button></div>;
}

function SupportDirectory({ t, announce }: PatientScreenProps) {
  return <div className="screen"><PageIntro eyebrow={t("safety.entry")} title={t("safety.supportTitle")} body={t("safety.noPromise")}/><div className="support-list">{[[HeartHandshake,"Health & counselling · Demo","Zanzibar City · 2.8 km"],[ShieldCheck,"Legal-aid referral · Demo","Confidential intake"],[Building2,"Temporary shelter referral · Demo","Navigator introduction required"]].map(([Icon,title,meta]) => { const RowIcon = Icon as LucideIcon; return <article key={String(title)}><span className="round-icon lavender"><RowIcon/></span><div><span className="verified"><BadgeCheck/>{t("care.verified")}</span><h2>{String(title)}</h2><p>{String(meta)}</p></div><button className="icon-button" onClick={() => announce(String(title))} aria-label={`${t("safety.support")}: ${String(title)}`}><ChevronRight/></button></article>; })}</div></div>;
}

function WalletScreen({ go, t, announce }: PatientScreenProps) {
  return <div className="screen"><PageIntro eyebrow={t("nav.profile")} title={t("wallet.title")} body={t("wallet.subtitle")}/><button className="upload-document" onClick={() => announce(t("wallet.add"))}><Plus/><span><strong>{t("wallet.add")}</strong><small>{t("wallet.subtitle")}</small></span></button><div className="document-list"><DocumentRow icon={FileHeart} title={t("wallet.lab")} meta="CBC · 5 Sep 2026" t={t} onClick={() => go("result")}/><DocumentRow icon={FileText} title={t("wallet.referral")} meta="MW-REF-018 · 29 Aug" t={t} onClick={() => go("sharing")}/><DocumentRow icon={FileKey2} title={t("wallet.prescription")} meta="MW-RX-0182 · 22 Aug" t={t} onClick={() => go("sharing")}/></div><button className="button outline full" onClick={() => go("sharing")}><ShieldCheck/>{t("sharing.title")}</button></div>;
}

function SharingScreen({ t, sharingActive, setSharingActive, announce }: PatientScreenProps) {
  return <div className="screen"><PageIntro eyebrow={t("privacy.control")} title={t("sharing.title")} body={t("sharing.warning")}/><section className="sharing-package"><label className="check-row"><input type="checkbox" defaultChecked/><span><strong>{t("wallet.lab")}</strong><small>CBC · 5 Sep 2026</small></span></label><label><span>{t("sharing.who")}</span><select><option>Dkt. Asha Khamis · Verified demo</option></select></label><label><span>{t("sharing.purpose")}</span><select><option>Follow-up consultation</option></select></label><label><span>{t("sharing.expiry")}</span><select><option>24 hours</option></select></label></section><div className="encryption-line"><LockKeyhole/><span>{t("privacy.control")}</span></div><button className={`button ${sharingActive ? "danger" : "primary"} full`} onClick={() => { setSharingActive(!sharingActive); announce(t(sharingActive ? "sharing.revoke" : "sharing.grant")); }}>{sharingActive ? <Trash2/> : <KeyRound/>}{t(sharingActive ? "sharing.revoke" : "sharing.grant")}</button></div>;
}

function HistoryScreen({ t }: PatientScreenProps) {
  return <div className="screen"><PageIntro eyebrow={t("privacy.control")} title={t("history.title")} body={t("sharing.warning")}/><div className="history-line"><span className="round-icon teal"><Smartphone/></span><div><h2>{t("history.you")}</h2><p>{t("wallet.lab")}</p><small>05 Sep 2026 · 10:22</small></div><span className="status confirmed">{t("status.active")}</span></div><div className="empty-inline"><EyeOff/><p>{t("history.none")}</p></div></div>;
}

function ProfileScreen({ go, t, privacyMode, setPrivacyMode }: PatientScreenProps) {
  return <div className="screen"><section className="profile-hero"><span className="profile-avatar">AJ</span><div><p className="overline">{t("profile.local")}</p><h1>Amina J.</h1><p>Device-only member · Demo</p></div></section><button className="privacy-toggle-card" onClick={() => setPrivacyMode(!privacyMode)}><span className="round-icon teal">{privacyMode ? <EyeOff/> : <Eye/>}</span><div><strong>{t("profile.mode")}</strong><small>{privacyMode ? t("home.privacyOn") : t("home.privacyOff")}</small></div><span className={`switch ${privacyMode ? "on" : ""}`}><i/></span></button><div className="settings-list"><MenuRow icon={ShieldCheck} title={t("profile.privacy")} meta={t("privacy.control")} onClick={() => go("privacyCentre")}/><MenuRow icon={Bell} title={t("profile.notifications")} meta={t("notifications.neutral")} onClick={() => go("notifications")}/><MenuRow icon={Globe2} title={t("profile.language")} meta="Kiswahili · English" onClick={() => go("languageSettings")}/><MenuRow icon={Smartphone} title={t("profile.devices")} meta={t("devices.current")} onClick={() => go("devices")}/><MenuRow icon={Shield} title={t("safety.entry")} meta={t("safety.subtitle")} onClick={() => go("safety")}/><MenuRow icon={HelpCircle} title={t("profile.help")} meta="Support · safeguarding · incidents" onClick={() => go("support")}/></div></div>;
}

function PrivacyCentre({ go, t }: PatientScreenProps) {
  return <div className="screen"><PageIntro eyebrow={t("nav.profile")} title={t("privacyCentre.title")} body={t("privacy.body")}/><section className="data-summary"><div className="data-orbit"><LockKeyhole/></div><div><strong>12</strong><span>{t("privacyCentre.ciphertext")}</span></div><div><strong>1</strong><span>{t("privacyCentre.device")}</span></div></section><div className="settings-list"><MenuRow icon={ShieldCheck} title={t("privacyCentre.permissions")} meta={t("sharing.warning")} onClick={() => go("sharing")}/><MenuRow icon={History} title={t("privacyCentre.history")} meta={t("history.you")} onClick={() => go("history")}/><MenuRow icon={KeyRound} title={t("privacyCentre.recovery")} meta={t("recovery.warning")} onClick={() => go("recovery")}/><MenuRow icon={Download} title={t("privacyCentre.export")} meta="Encrypted JSON · readable PDF" onClick={() => go("empty")}/><MenuRow icon={Trash2} tone="danger" title={t("privacyCentre.delete")} meta={t("privacy.control")} onClick={() => go("empty")}/><MenuRow icon={Trash2} tone="danger" title={t("privacyCentre.account")} meta={t("account.privateHelp")} onClick={() => go("empty")}/></div></div>;
}

function NotificationScreen({ t, announce }: PatientScreenProps) {
  const [neutral, setNeutral] = useState(true);
  return <div className="screen"><PageIntro eyebrow={t("nav.profile")} title={t("notifications.title")} body={t("notifications.neutral")}/><button className="privacy-toggle-card" onClick={() => setNeutral(!neutral)}><span className="round-icon teal"><Bell/></span><div><strong>{t("notifications.neutral")}</strong><small>{t("notifications.preview")}</small></div><span className={`switch ${neutral ? "on" : ""}`}><i/></span></button><section className="notification-preview"><span>MWANAMKE</span><p>{t("notifications.preview")}</p><small>now</small></section><button className="button primary full" onClick={() => announce(t("common.save"))}>{t("common.save")}<Check/></button></div>;
}

function LanguageSettings({ language, setLanguage, t, announce }: PatientScreenProps) {
  return <div className="screen"><PageIntro eyebrow={t("nav.profile")} title={t("language.title")} body={t("language.subtitle")}/><div className="language-cards"><button className={language === "sw" ? "selected" : ""} onClick={() => { setLanguage("sw"); announce("Lugha imebadilishwa"); }}><span className="language-code">SW</span><span><strong>Kiswahili</strong><small>Endelea kwa Kiswahili</small></span><Check/></button><button className={language === "en" ? "selected" : ""} onClick={() => { setLanguage("en"); announce("Language changed"); }}><span className="language-code">EN</span><span><strong>English</strong><small>Continue in English</small></span><Check/></button></div></div>;
}

function DevicesScreen({ t, announce }: PatientScreenProps) {
  return <div className="screen"><PageIntro eyebrow={t("privacy.control")} title={t("devices.title")} body={t("account.createHelp")}/><article className="device-card"><span className="round-icon teal"><Smartphone/></span><div><span className="status confirmed">{t("status.active")}</span><h2>Samsung Galaxy A14 · Demo</h2><p>{t("devices.current")}</p><small>Last active · now</small></div></article><button className="button primary full" onClick={() => announce(t("devices.authorize"))}><Plus/>{t("devices.authorize")}</button><div className="clinical-note"><KeyRound/><span>{t("recovery.warning")}</span></div></div>;
}

function OfflineScreen({ t, online, setOnline, go }: PatientScreenProps) {
  return <div className="screen center-screen"><div className={`offline-orbit ${online ? "online" : ""}`}>{online ? <Cloud/> : <CloudOff/>}</div><p className="overline">{online ? t("home.sync") : t("home.offline")}</p><h1>{online ? t("home.sync") : t("offline.title")}</h1><p className="lead compact">{t("offline.body")}</p><section className="offline-queue"><span><LockKeyhole/>3</span><div><strong>Encrypted updates</strong><small>{online ? t("home.sync") : t("home.offline")}</small></div><CheckCircle2/></section><button className="button primary full" onClick={() => { setOnline(true); go("home"); }}>{t("offline.retry")}<Wifi/></button></div>;
}

function EmptyScreen({ t, go }: PatientScreenProps) {
  return <div className="screen center-screen"><div className="empty-orbit"><FileText/></div><h1>{t("empty.title")}</h1><p className="lead compact">{t("empty.body")}</p><button className="button primary" onClick={() => go("home")}>{t("confirmation.home")}</button></div>;
}

type ProviderSection = "schedule" | "calendar" | "shared" | "messages";
type NavigatorSection = "queue" | "messages" | "directory";
type AdminSection = "overview" | "access" | "providers" | "content" | "incidents" | "audit";
type PortalSection = ProviderSection | NavigatorSection | AdminSection;

const providerVisits = [
  { id: "APT-2081", date: "2026-09-08", time: "09:30", member: "Amina J.", visit: "Reproductive health consultation", status: "confirmed" },
  { id: "APT-2082", date: "2026-09-08", time: "10:15", member: "Private member", visit: "Antenatal follow-up", status: "confirmed" },
  { id: "APT-2083", date: "2026-09-08", time: "11:00", member: "Saada M.", visit: "Postpartum follow-up", status: "confirmed" },
  { id: "APT-2084", date: "2026-09-09", time: "14:30", member: "Private member", visit: "Virtual consultation", status: "requested" }
] as const;

function Portal({ workspace, t, language, announce, onExit }: { workspace: Exclude<Workspace, "patient">; t: T; language: Language; announce: (message: string) => void; onExit: () => void }) {
  const initial: Record<Exclude<Workspace, "patient">, PortalSection> = { provider: "schedule", navigator: "queue", admin: "overview" };
  const [section, setSection] = useState<PortalSection>(initial[workspace]);
  const sw = language === "sw";
  const nav: Array<[PortalSection, LucideIcon, string]> = workspace === "provider"
    ? [["schedule", Clock3, sw ? "Ratiba ya leo" : "Today’s schedule"], ["calendar", CalendarDays, sw ? "Kalenda" : "Calendar"], ["shared", ShieldCheck, sw ? "Ruhusa za taarifa" : "Shared records"], ["messages", MessageCircle, sw ? "Ujumbe salama" : "Secure messages"]]
    : workspace === "navigator"
      ? [["queue", HeartHandshake, sw ? "Foleni ya huduma" : "Care queue"], ["messages", MessageCircle, sw ? "Ujumbe binafsi" : "Private messages"], ["directory", MapPin, sw ? "Tafuta huduma" : "Find trusted care"]]
      : [["overview", Activity, sw ? "Muhtasari" : "Overview"], ["access", KeyRound, sw ? "Watumiaji na ruhusa" : "Users & access"], ["providers", UserRoundCheck, t("adminPortal.providers")], ["content", ClipboardCheck, t("adminPortal.content")], ["incidents", AlertTriangle, t("adminPortal.incidents")], ["audit", History, t("adminPortal.audit")]];
  const renderNavButtons = () => nav.map(([id, Icon, label]) => <button key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)} aria-current={section === id ? "page" : undefined}><Icon/><span>{label}</span></button>);
  const dateLabel = new Intl.DateTimeFormat(language === "sw" ? "sw-TZ" : "en-TZ", { weekday: "short", day: "2-digit", month: "long", year: "numeric", timeZone: "Africa/Dar_es_Salaam" }).format(new Date());
  return <div className="portal-shell"><aside className="portal-sidebar"><div className="portal-brand"><BrandMark/><div><strong>MWANAMKE</strong><span>{t(workspace === "provider" ? "portal.provider" : workspace === "navigator" ? "portal.navigator" : "portal.admin")}</span></div></div><div className="restricted-badge"><LockKeyhole/>{t("portal.secure")}</div><nav aria-label={sw ? "Urambazaji wa eneo la kazi" : "Workspace navigation"}>{renderNavButtons()}</nav><button className="portal-lock" onClick={onExit}><Lock/>{t("portal.signout")}</button></aside><main className="portal-main"><header className="portal-top"><div><p className="overline">{dateLabel.toUpperCase()} · EAT</p><h1>{t(workspace === "provider" ? "providerPortal.title" : workspace === "navigator" ? "navigatorPortal.title" : "adminPortal.title")}</h1></div><div className="portal-user"><span>{workspace === "provider" ? "AK" : workspace === "navigator" ? "ZN" : "PA"}</span><div><strong>{workspace === "provider" ? "Dkt. Asha Khamis" : workspace === "navigator" ? "Zawadi N." : "Platform Admin"}</strong><small>{t("common.demo")}</small></div></div></header><nav className="portal-mobile-nav" aria-label={sw ? "Urambazaji wa eneo la kazi" : "Workspace navigation"}>{renderNavButtons()}</nav>{workspace === "provider" ? <ProviderPortal t={t} language={language} section={section as ProviderSection} announce={announce}/> : workspace === "navigator" ? <NavigatorPortal t={t} language={language} section={section as NavigatorSection} announce={announce}/> : <AdminPortal t={t} language={language} section={section as AdminSection} announce={announce}/>}</main></div>;
}

function ProviderPortal({ t, language, section, announce }: { t: T; language: Language; section: ProviderSection; announce: (message: string) => void }) {
  const [selectedDate, setSelectedDate] = useState("2026-09-08");
  const [draft, setDraft] = useState("");
  const sw = language === "sw";
  const visits = providerVisits.filter((visit) => visit.date === selectedDate);
  const send = () => { if (!draft.trim()) return; announce(sw ? "Ujumbe ulisimbwa na kutumwa" : "Message encrypted and sent"); setDraft(""); };
  const intro = <><div className="portal-intro"><p>{t("providerPortal.subtitle")}</p><span><ShieldCheck/>{t("adminPortal.noRecords")}</span></div><div className="metric-grid"><Metric icon={CalendarDays} value="3" label={sw ? "Miadi leo" : "Appointments today"} tone="teal"/><Metric icon={ShieldCheck} value="1" label={t("providerPortal.shared")} tone="lavender"/><Metric icon={MessageCircle} value="2" label={sw ? "Ujumbe mpya" : "New messages"} tone="coral"/></div></>;
  if (section === "calendar") return <div className="portal-content">{intro}<section className="portal-panel"><div className="panel-heading"><div><p className="overline">SEPTEMBER 2026 · EAT</p><h2>{sw ? "Kalenda ya miadi" : "Appointment calendar"}</h2></div><button className="button outline" onClick={() => setSelectedDate("2026-09-08")}><CalendarDays/>{sw ? "Leo" : "Today"}</button></div><div className="provider-calendar"><div className="calendar-days">{Array.from({ length: 14 }, (_, i) => i + 1).map((day) => { const date = `2026-09-${String(day).padStart(2, "0")}`; const count = providerVisits.filter((visit) => visit.date === date).length; return <button key={date} className={selectedDate === date ? "active" : ""} onClick={() => setSelectedDate(date)} aria-pressed={selectedDate === date}><small>{new Intl.DateTimeFormat(language === "sw" ? "sw-TZ" : "en-TZ", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</small><strong>{day}</strong>{count > 0 && <span>{count}</span>}</button>; })}</div><div className="calendar-agenda"><h3>{new Intl.DateTimeFormat(language === "sw" ? "sw-TZ" : "en-TZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${selectedDate}T12:00:00Z`))}</h3>{visits.length ? visits.map((visit) => <button key={visit.id} onClick={() => announce(`${visit.id} · ${visit.member}`)}><time>{visit.time}</time><span><strong>{visit.visit}</strong><small>{visit.member} · {visit.id}</small></span><ChevronRight/></button>) : <div className="portal-empty"><CalendarDays/><strong>{sw ? "Hakuna miadi" : "No appointments"}</strong><p>{sw ? "Hakuna miadi iliyowekwa siku hii." : "No appointments are scheduled for this day."}</p></div>}</div></div></section></div>;
  if (section === "shared") return <div className="portal-content">{intro}<section className="consent-panel"><div><span className="round-icon teal"><KeyRound/></span><div><span className="verified"><ShieldCheck/>{t("status.active")}</span><h2>Amina J. · {t("wallet.lab")}</h2><p>{t("providerPortal.expiry")}. {t("sharing.warning")}</p></div></div><button className="button primary" onClick={() => announce(t("providerPortal.open"))}>{t("providerPortal.open")}<ArrowRight/></button></section><section className="portal-panel compact-panel"><div className="panel-heading"><div><p className="overline">CONSENT BOUNDARY</p><h2>{sw ? "Ruhusa nyingine" : "Other sharing permissions"}</h2></div></div><div className="portal-empty"><ShieldCheck/><strong>{sw ? "Hakuna ruhusa nyingine" : "No other active permissions"}</strong><p>{sw ? "Taarifa zinaonekana tu baada ya mgonjwa kutoa ruhusa yenye muda." : "Records appear only after a patient grants time-limited consent."}</p></div></section></div>;
  if (section === "messages") return <div className="portal-content">{intro}<section className="secure-message-panel"><div className="panel-heading"><div><p className="overline">END-TO-END ENCRYPTED · DEMO</p><h2>{sw ? "Ujumbe wa wagonjwa" : "Patient messages"}</h2></div><span className="status active">2 {t("status.new")}</span></div><div className="message-thread"><div className="message received">{sw ? "Nimepokea maelekezo ya miadi. Asante." : "I received the appointment instructions. Thank you."}<small>08:42</small></div><div className="message sent">{sw ? "Karibu. Tafadhali tumia kitufe cha miadi ukihitaji kubadilisha muda." : "You’re welcome. Please use the appointment action if you need to change the time."}<small><Check/>08:46</small></div></div><div className="portal-composer"><label className="sr-only" htmlFor="provider-message">{sw ? "Andika ujumbe" : "Write a message"}</label><input id="provider-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") send(); }} placeholder={sw ? "Andika ujumbe salama…" : "Write a secure message…"}/><button onClick={send} disabled={!draft.trim()} aria-label={sw ? "Tuma ujumbe" : "Send message"}><Send/></button></div></section></div>;
  return <div className="portal-content">{intro}<section className="portal-panel"><div className="panel-heading"><div><p className="overline">{t("appointments.upcoming")}</p><h2>{t("providerPortal.queue")}</h2></div><button className="button outline" onClick={() => announce(sw ? "Kalenda imefunguliwa kwenye tarehe 8 Septemba" : "Calendar focused on 8 September")}><CalendarDays/>08 Sep 2026</button></div><div className="portal-table"><div className="table-head"><span>{sw ? "Muda" : "Time"}</span><span>{sw ? "Mwanachama" : "Member"}</span><span>{sw ? "Huduma" : "Visit"}</span><span>{sw ? "Hali" : "Status"}</span><span/></div>{providerVisits.filter((visit) => visit.date === "2026-09-08").map((visit) => <div className="table-row" key={visit.id}><strong>{visit.time}</strong><span className="member-cell"><i>{visit.member === "Private member" ? "••" : visit.member.split(" ").map((part) => part[0]).join("")}</i>{visit.member}</span><span>{visit.visit}</span><span className="status confirmed">{t("appointments.confirmed")}</span><button className="button soft" onClick={() => announce(`${t("providerPortal.open")}: ${visit.id}`)}>{sw ? "Fungua miadi" : "Open visit"}</button></div>)}</div></section><p className="demo-footnote">{providers[0]!.facility[language]} · {t("common.demo")}</p></div>;
}

function NavigatorPortal({ t, language, section, announce }: { t: T; language: Language; section: NavigatorSection; announce: (message: string) => void }) {
  const [selectedCase, setSelectedCase] = useState<(typeof careCases)[number]["id"]>(careCases[0]!.id);
  const [draft, setDraft] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const sw = language === "sw";
  const activeCase = careCases.find((item) => item.id === selectedCase) ?? careCases[0]!;
  const send = () => { if (!draft.trim()) return; announce(sw ? "Ujumbe ulisimbwa na kutumwa" : "Message encrypted and sent"); setDraft(""); };
  const metrics = <div className="metric-grid"><Metric icon={MessageCircle} value="3" label={t("status.new")} tone="teal"/><Metric icon={Clock3} value="5m" label={t("navigator.status")} tone="lavender"/><Metric icon={HeartHandshake} value="12" label={t("status.followUp")} tone="coral"/></div>;
  if (section === "directory") return <div className="portal-content"><div className="portal-intro"><p>{sw ? "Linganisha huduma zilizohakikiwa kwa eneo, bei, upatikanaji na ufikivu." : "Compare verified care by location, price, availability and accessibility."}</p><span><BadgeCheck/>{providers.length} {sw ? "watoa huduma waliothibitishwa" : "verified providers"}</span></div><section className="portal-panel"><div className="panel-heading"><div><p className="overline">VERIFIED DIRECTORY · DEMO</p><h2>{sw ? "Tafuta huduma inayoaminika" : "Find trusted care"}</h2></div><button className="button outline" onClick={() => announce(sw ? "Vichujio vimewekwa upya" : "Filters reset")}><Search/>{sw ? "Wote" : "All care"}</button></div><div className="trusted-care-grid">{providers.map((provider) => <article key={provider.id}><Portrait provider={provider}/><div><span className="verified"><BadgeCheck/>{t("care.verified")}</span><h3>{provider.name}</h3><p>{provider.specialty[language]}</p><small><MapPin/>{provider.location[language]} · {provider.distanceKm} km</small><strong>{provider.priceTzs.toLocaleString()} TZS · {provider.nextSlot}</strong></div><button className="button soft" onClick={() => announce(`${provider.name}: ${sw ? "imetumwa kwa mwanachama" : "sent to member"}`)}>{sw ? "Tuma chaguo" : "Send option"}</button></article>)}</div></section></div>;
  if (section === "queue") return <div className="portal-content"><div className="portal-intro"><p>{t("navigatorPortal.subtitle")}</p><span><ShieldCheck/>{sw ? "Uratibu tu — si maamuzi ya kitabibu" : "Navigation only — no clinical decisions"}</span></div>{metrics}<section className="portal-panel"><div className="panel-heading"><div><p className="overline">LIVE · OPERATIONAL</p><h2>{t("navigatorPortal.title")}</h2></div></div><div className="navigator-queue">{careCases.map((item) => <button key={item.id} onClick={() => { setSelectedCase(item.id); announce(`${t("navigatorPortal.assign")}: ${item.id}`); }}><span className="contact-avatar">{item.member === "Private member" ? "••" : item.member.split(" ").map((part) => part[0]).join("")}</span><span><strong>{item.member}</strong><small>{item.need[language]} · {item.id}</small></span><span className={`status ${item.status}`}>{t(`status.${item.status}` as MessageKey)}</span><ChevronRight/></button>)}</div></section></div>;
  return <div className="portal-content"><div className="portal-intro"><p>{t("navigatorPortal.subtitle")}</p><span><ShieldCheck/>{sw ? "Ujumbe umesimbwa kutoka mwanzo hadi mwisho" : "End-to-end encrypted messaging"}</span></div>{metrics}<div className="navigator-desk"><section className="case-list"><div className="panel-heading"><div><p className="overline">PRIVATE · ENCRYPTED</p><h2>{sw ? "Mazungumzo" : "Conversations"}</h2></div></div>{careCases.map((item) => <button key={item.id} className={selectedCase === item.id ? "active" : ""} onClick={() => setSelectedCase(item.id)} aria-pressed={selectedCase === item.id}><span className="contact-avatar">{item.member === "Private member" ? "••" : item.member.split(" ").map((part) => part[0]).join("")}</span><div><strong>{item.member}</strong><p>{item.need[language]}</p><small>{item.id} · {item.wait}</small></div><span className={`status ${item.status}`}>{t(`status.${item.status}` as MessageKey)}</span></button>)}</section><section className="case-detail"><div className="case-person"><span className="contact-avatar">{activeCase.member === "Private member" ? "••" : activeCase.member.split(" ").map((part) => part[0]).join("")}</span><div><h2>{activeCase.member}</h2><p><i/>{t(`status.${activeCase.status}` as MessageKey)} · {activeCase.id}</p></div><button className="button outline" onClick={() => announce(`${t("navigatorPortal.assign")}: ${activeCase.id}`)}>{t("navigatorPortal.assign")}</button></div><div className="scope-banner"><ShieldCheck/><span><strong>{sw ? "Uratibu wa huduma pekee" : "Navigation scope only"}</strong>{t("navigatorPortal.subtitle")}</span></div><div className="case-thread"><div className="message received">{activeCase.need[language]}<small>10:38</small></div><div className="message sent">{sw ? "Ninaweza kulinganisha huduma zilizohakikiwa, bei na muda unaopatikana." : "I can compare verified services, prices and the next available options."}<small><Check/>10:40</small></div></div><div className={`draft-assistant ${assistantOpen ? "open" : ""}`}><button className="assistant-toggle" onClick={() => setAssistantOpen(!assistantOpen)} aria-expanded={assistantOpen}><Bot/>{sw ? "Msaidizi wa kuandaa ujumbe" : "Private drafting assistant"}<ChevronRight/></button>{assistantOpen && <div><p><ShieldCheck/>{sw ? "Msaidizi haoni mazungumzo, majina au taarifa za afya. Mapendekezo haya ya kawaida hutengenezwa kwenye kifaa na lazima yapitiwe na mratibu." : "The assistant cannot see the thread, names or health data. These neutral templates are generated on-device and require navigator review."}</p><div>{(sw ? ["Ninaweza kutafuta muda unaopatikana.", "Ninaweza kulinganisha bei na eneo.", "Nitatuma chaguo zilizohakikiwa kwa ukaguzi wako."] : ["I can find the next available times.", "I can compare price and location.", "I’ll send verified options for your review."]).map((suggestion) => <button key={suggestion} onClick={() => setDraft(suggestion)}>{suggestion}</button>)}</div></div>}</div><div className="portal-composer"><label className="sr-only" htmlFor="navigator-message">{t("navigator.placeholder")}</label><input id="navigator-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") send(); }} placeholder={t("navigator.placeholder")}/><button onClick={send} disabled={!draft.trim()} aria-label={t("navigator.send")}><Send/></button></div></section></div></div>;
}

function AdminPortal({ t, language, section, announce }: { t: T; language: Language; section: AdminSection; announce: (message: string) => void }) {
  const sw = language === "sw";
  const [reviewedProviders, setReviewedProviders] = useState<string[]>([]);
  const providerApplications = [
    { id: "PV-0204", initials: "MH", name: "Dkt. Mwanaidi Hassan", title: sw ? "Daktari wa familia" : "Family physician", facility: sw ? "Kituo cha Afya Mji Mkongwe · Mfano" : "Stone Town Health Centre · Demo" },
    { id: "PV-0205", initials: "FA", name: "Muuguzi Fatma Ali", title: sw ? "Muuguzi na mkunga" : "Registered nurse-midwife", facility: sw ? "Kliniki ya Jamii Pemba · Mfano" : "Pemba Community Clinic · Demo" }
  ];
  const pendingProviderCount = providerApplications.length - reviewedProviders.length;
  const panelTitle = section === "access" ? (sw ? "Watumiaji na udhibiti wa ruhusa" : "Users and access control") : section === "providers" ? t("adminPortal.providers") : section === "content" ? t("adminPortal.content") : section === "incidents" ? t("adminPortal.incidents") : section === "audit" ? t("adminPortal.audit") : t("adminPortal.aggregate");
  const exportAggregate = () => {
    const payload = JSON.stringify({ generatedAt: new Date().toISOString(), activeMembers: 4820, verifiedProviders: 34, pendingReviews: pendingProviderCount, incidents: 0, individualRecordsIncluded: false }, null, 2);
    const href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = "mwanamke-aggregate-demo.json";
    link.click();
    URL.revokeObjectURL(href);
    announce(t("common.done"));
  };
  return <div className="portal-content"><div className="portal-intro warning"><p>{t("adminPortal.subtitle")}</p><span><EyeOff/>{t("adminPortal.noRecords")}</span></div><div className="metric-grid"><Metric icon={UsersRound} value="4,820" label={t("adminPortal.aggregate")} tone="teal"/><Metric icon={UserRoundCheck} value="34" label={sw ? "Watoa huduma waliothibitishwa" : "Verified providers"} tone="lavender"/><Metric icon={ClipboardCheck} value={String(pendingProviderCount)} label={t("status.pending")} tone="coral"/><Metric icon={AlertTriangle} value="0" label={t("adminPortal.incidents")} tone="navy"/></div><section className="portal-panel"><div className="panel-heading"><div><p className="overline">OPERATIONAL DATA ONLY</p><h2>{panelTitle}</h2></div><button className="button outline" onClick={exportAggregate}><Download/>{sw ? "Hamisha jumla" : "Export aggregate"}</button></div>{section === "access" ? <div className="access-policy-list">{[
    [Heart, sw ? "Mgonjwa" : "Patient", sw ? "Usajili binafsi kupitia OIDC; jukumu pekee linaloundwa kiotomatiki." : "OIDC self-registration; the only role eligible for automatic provisioning.", sw ? "Self-service" : "Self-service"],
    [Stethoscope, sw ? "Mtoa huduma" : "Provider", sw ? "Maombi, uthibitishaji wa leseni, kisha akaunti ya mwaliko." : "Application, licence verification, then invitation-bound account.", sw ? "Imehakikiwa" : "Verified"],
    [HeartHandshake, sw ? "Mratibu" : "Navigator", sw ? "Mwaliko wa taasisi, MFA na ruhusa ndogo zaidi." : "Organisation invitation, MFA and least-privilege access.", sw ? "Kwa mwaliko" : "Invite-only"],
    [MonitorCog, sw ? "Msimamizi" : "Administrator", sw ? "SSO ya wafanyakazi, MFA na idhini ya watu wawili kwa mabadiliko hatari." : "Workforce SSO, MFA and dual approval for high-risk changes.", "SSO + MFA"]
  ].map(([Icon, name, body, mode]) => { const RowIcon = Icon as LucideIcon; return <div key={String(name)}><span className="round-icon teal"><RowIcon/></span><div><h3>{String(name)}</h3><p>{String(body)}</p></div><span className="status active">{String(mode)}</span><button className="button soft" onClick={() => announce(`${String(name)} · ${sw ? "sera imefunguliwa" : "policy opened"}`)}>{sw ? "Angalia sera" : "View policy"}</button></div>; })}</div> : section === "content" ? <div className="admin-list">{clinicalContent.map((item) => <div key={item.id}><span className="round-icon teal"><ClipboardCheck/></span><div><h3>{item.title[language]}</h3><p>{item.id} · v{item.version} · {item.reviewer}</p></div><span className="status confirmed">{t("status.approved")}</span><button className="button soft" onClick={() => announce(`${item.id} · ${sw ? "historia imefunguliwa" : "review history opened"}`)}>{sw ? "Historia" : "History"}</button></div>)}</div> : section === "incidents" ? <div className="portal-empty"><ShieldCheck/><strong>{sw ? "Hakuna tukio wazi" : "No open incidents"}</strong><p>{sw ? "Malalamiko na matukio mapya yataonekana hapa kwa kiwango cha kipaumbele." : "New complaints and incidents will appear here with severity and ownership."}</p><button className="button outline" onClick={() => announce(sw ? "Mwongozo wa kuripoti umefunguliwa" : "Incident reporting guide opened")}><FileText/>{sw ? "Mwongozo wa kuripoti" : "Reporting guide"}</button></div> : section === "audit" ? <div className="audit-list">{auditEvents.map((item) => <div key={item.id}><code>{item.id}</code><strong>{item.action}</strong><span>{item.actor}</span><small>{item.scope}</small><time>{item.at}</time></div>)}</div> : section === "providers" ? <div className="provider-verifications">{providerApplications.map((provider) => <div key={provider.id}><span className="contact-avatar">{provider.initials}</span><div><h3>{provider.name}</h3><p>{provider.title} · {provider.facility}</p><small>{provider.id} · {sw ? "Utambulisho, leseni na uhusiano wa kituo vinahitaji ukaguzi." : "Identity, licence and facility affiliation require review."}</small></div><span className={`status ${reviewedProviders.includes(provider.id) ? "active" : "pending"}`}>{reviewedProviders.includes(provider.id) ? (sw ? "Imepitiwa leo" : "Reviewed today") : t("status.pending")}</span><button className="button soft" disabled={reviewedProviders.includes(provider.id)} onClick={() => { setReviewedProviders((items) => [...items, provider.id]); announce(`${sw ? "Ukaguzi umehifadhiwa" : "Review recorded"}: ${provider.name}`); }}>{reviewedProviders.includes(provider.id) ? t("common.done") : (sw ? "Anza ukaguzi" : "Start review")}</button></div>)}</div> : <div className="assurance-grid"><button onClick={() => announce(sw ? "Uhakiki wa utambulisho uko sawa" : "Identity controls healthy")}><KeyRound/><strong>{sw ? "Udhibiti wa utambulisho" : "Identity controls"}</strong><small>OIDC · MFA · role mapping</small><CheckCircle2/></button><button onClick={() => announce(sw ? "Foleni ya outbox iko sawa" : "Outbox healthy")}><Activity/><strong>{sw ? "Uwasilishaji wa matukio" : "Event delivery"}</strong><small>0 failed · 0 delayed</small><CheckCircle2/></button><button onClick={() => announce(sw ? "Hifadhidata iko tayari" : "Database ready")}><Building2/><strong>PostgreSQL</strong><small>transactional · encrypted at rest</small><CheckCircle2/></button><button onClick={() => announce(sw ? "Cheti cha ukaguzi kinahitajika kabla ya uzalishaji" : "Independent review evidence required before launch")}><ShieldCheck/><strong>{sw ? "Ushahidi wa uzalishaji" : "Launch evidence"}</strong><small>{sw ? "Uidhinishaji wa nje bado unahitajika" : "Independent approvals still required"}</small><AlertTriangle/></button></div>}</section></div>;
}

function PageIntro({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) { return <header className="page-intro">{eyebrow && <p className="overline">{eyebrow}</p>}<h1>{title}</h1>{body && <p>{body}</p>}</header>; }
function ServiceButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) { return <button className="service-button" onClick={onClick}><span><Icon/></span><strong>{label}</strong><ChevronRight/></button>; }
function InfoCell({ icon: Icon, label, meta }: { icon: LucideIcon; label: string; meta: string }) { return <div className="info-cell"><Icon/><div><strong>{label}</strong><small>{meta}</small></div></div>; }
function MenuRow({ icon: Icon, title, meta, onClick, tone = "teal" }: { icon: LucideIcon; title: string; meta: string; onClick: () => void; tone?: string }) { return <button className="menu-row" onClick={onClick}><span className={`round-icon ${tone}`}><Icon/></span><span><strong>{title}</strong><small>{meta}</small></span><ChevronRight/></button>; }
function TimelineRow({ title, meta, done = false, current = false }: { title: string; meta: string; done?: boolean; current?: boolean }) { return <div className={`timeline-row ${done ? "done" : ""} ${current ? "current" : ""}`}><span>{done ? <Check/> : <i/>}</span><div><strong>{title}</strong><small>{meta}</small></div></div>; }
function DocumentRow({ icon: Icon, title, meta, t, onClick }: { icon: LucideIcon; title: string; meta: string; t: T; onClick: () => void }) { return <button className="document-row" onClick={onClick}><span className="document-icon"><Icon/></span><span><strong>{title}</strong><small>{meta}</small><em><LockKeyhole/>{t("wallet.encrypted")}</em></span><ChevronRight/></button>; }
function Metric({ icon: Icon, value, label, tone }: { icon: LucideIcon; value: string; label: string; tone: string }) { return <article className="metric-card"><span className={`round-icon ${tone}`}><Icon/></span><div><strong>{value}</strong><p>{label}</p></div></article>; }
