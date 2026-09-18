"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PatientSpace, type PatientView } from "./PatientSpace";
import {
  Baby,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CircleAlert,
  ClipboardList,
  Clock3,
  HeartHandshake,
  Languages,
  LockKeyhole,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  UserRound,
  WalletCards,
  X
} from "lucide-react";

type Language = "sw" | "en";
type Actor = { id: string; role: string; accountStatus: string };
type RecordDto = {
  id: string;
  kind?: "export" | "deletion";
  createdAt?: string;
  displayName?: string;
  titleEn?: string;
  titleSw?: string;
  verified?: boolean;
  languages?: string[];
  status?: string;
  startsAt?: string;
  endsAt?: string;
  mode?: string;
  amountTzs?: number;
  currency?: string;
  assignedAt?: string;
  nameEn?: string;
  nameSw?: string;
  priceTzs?: number;
  holdExpiresAt?: string;
  facility?: {
    nameEn: string;
    nameSw: string;
    locality: string;
    accessibilityEn: string;
    accessibilitySw: string;
  };
};
type Page = { data: RecordDto[]; nextCursor: string | null };
type Confirmation = {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "danger";
  action: () => Promise<void>;
};

function Brand() {
  return (
    <Link href="/" className="live-brand" aria-label="MWANAMKE">
      <span aria-hidden="true">M</span>
      <strong>MWANAMKE</strong>
    </Link>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "secondary",
  className = ""
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`live-button live-button-${variant} ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function StatusMessage({ children, kind, dismissLabel, onDismiss }: { children: ReactNode; kind: "success" | "error"; dismissLabel?: string; onDismiss?: () => void }) {
  return (
    <div className={`live-message live-message-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {kind === "success" ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      <div>{children}</div>
      {onDismiss ? (
        <button type="button" className="live-icon-button" onClick={onDismiss} aria-label={dismissLabel}>
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function Skeletons({ label }: { label: string }) {
  return (
    <div className="live-grid" role="status" aria-label={label}>
      {[0, 1, 2].map((item) => (
        <div className="live-card live-skeleton" key={item} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export function LivePortal({ signedIn, authFailed, initialLanguage, localRolePreview }: { signedIn: boolean; authFailed: boolean; initialLanguage: Language; localRolePreview: boolean }) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [actor, setActor] = useState<Actor | null>(null);
  const [path, setPath] = useState("providers");
  const [rows, setRows] = useState<RecordDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(authFailed ? (initialLanguage === "sw" ? "Kuingia hakukukamilika. Tafadhali jaribu tena." : "Sign-in could not be completed. Please try again.") : "");
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<RecordDto | null>(null);
  const [service, setService] = useState<RecordDto | null>(null);
  const [savedLanguage, setSavedLanguage] = useState<string>("");
  const [notice, setNotice] = useState("");
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const requestSequence = useRef(0);
  const dialogRef = useRef<HTMLElement | null>(null);
  const t = (sw: string, en: string) => (language === "sw" ? sw : en);
  const languageName = (value: string) => value === "sw" ? t("Kiswahili", "Swahili") : value === "en" ? t("Kiingereza", "English") : value.toUpperCase();
  const changeLanguage = (value: Language) => {
    setLanguage(value);
    setError("");
    setNotice("");
    setConfirmation(null);
    document.cookie = `mwanamke-language=${value}; Path=/; SameSite=Lax; Max-Age=31536000`;
    document.documentElement.lang = value;
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(language === "sw" ? "sw-TZ" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Dar_es_Salaam"
    }).format(new Date(value));

  const formatMoney = (amount = 0, currency = "TZS") =>
    new Intl.NumberFormat(language === "sw" ? "sw-TZ" : "en-TZ", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(amount);

  const load = async (endpoint: string, more?: string) => {
    const sequence = ++requestSequence.current;
    setBusy(true);
    setError("");
    setPath(endpoint);
    if (!more) {
      setRows([]);
      setCursor(null);
    }

    try {
      const response = await fetch(`/api/care/${endpoint}${more ? `?cursor=${encodeURIComponent(more)}` : ""}`, {
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? t("Kipindi chako kimeisha. Ingia tena.", "Your session expired. Sign in again.")
            : response.status === 403
              ? t("Huruhusiwi kufikia taarifa hizi.", "You do not have access to this information.")
              : t("Huduma haipatikani. Angalia mtandao kisha ujaribu tena.", "The service is unavailable. Check your connection and retry.")
        );
      }

      const result = await response.json();
      if (sequence !== requestSequence.current) return;

      if (endpoint === "admin/aggregate") {
        setMetrics(result.data ?? result);
        setRows([]);
        setCursor(null);
      } else {
        const page = result as Page;
        if (!Array.isArray(page.data)) throw new Error(t("Jibu la huduma halikuwa sahihi.", "The service returned an invalid response."));
        setRows((previous) => (more ? [...previous, ...page.data] : page.data));
        setCursor(page.nextCursor);
      }
    } catch (reason) {
      if (sequence === requestSequence.current) {
        setError(reason instanceof Error ? reason.message : t("Huduma haipatikani.", "Service unavailable."));
      }
    } finally {
      if (sequence === requestSequence.current) setBusy(false);
    }
  };

  const mutate = async (endpoint: string, payload: object, method = "POST") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/care/${endpoint}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error === "SLOT_UNAVAILABLE"
            ? t("Nafasi hii imechukuliwa. Chagua nyingine.", "This slot is no longer available. Choose another.")
            : result.error === "PAYMENT_REQUIRED"
              ? t("Malipo yanahitajika kabla ya kuthibitisha.", "Payment is required before confirmation.")
              : t("Ombi halijakamilika. Sasisha taarifa kisha ujaribu tena.", "The request could not be completed. Refresh and try again.")
        );
      }

      if (endpoint === "profile") {
        setSavedLanguage(language);
        setNotice(t("Lugha imehifadhiwa kwenye akaunti yako.", "Your account language has been saved."));
      } else if (endpoint === "privacy/requests") {
        setNotice(t("Ombi limepokelewa. Timu ya faragha bado inapaswa kulishughulikia.", "Request received. The privacy team must still review and fulfill it."));
        await load("privacy/requests");
      } else {
        setNotice(endpoint === "appointments" ? t("Nafasi imehifadhiwa kwa dakika 15. Kamilisha hatua inayofuata ili kuthibitisha.", "The slot is held for 15 minutes. Complete the next step to confirm.") : t("Mabadiliko yamehifadhiwa.", "Your change has been saved."));
        setProvider(null);
        setService(null);
        await load("appointments");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Huduma haipatikani.", "Service unavailable."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    void fetch("/api/care/profile", { cache: "no-store" }).then(async (response) => {
      if (response.ok) {
        const result = await response.json();
        if (active) setSavedLanguage(result.data.preferredLanguage);
      }
    }).catch(() => undefined);
    void fetch("/api/care/me", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(t("Kipindi chako hakikuweza kuthibitishwa. Ingia tena.", "Your session could not be verified. Sign in again."));
      const result = await response.json();
      if (!active) return;
      setActor(result.data);
      const endpoint = result.data.role === "provider" ? "appointments" : result.data.role === "navigator" ? "navigator/assignments" : result.data.role.endsWith("admin") ? "admin/aggregate" : "personal";
      if (endpoint === "personal") setPath(endpoint);
      else void load(endpoint);
    }).catch((reason) => {
      if (active) setError(reason.message);
    });
    return () => { active = false; };
    // The authenticated identity chooses the first authorized section.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  useEffect(() => {
    if (!confirmation) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmation(null);
    };
    dialogRef.current?.focus();
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [confirmation]);

  const navigate = (endpoint: string, nextProvider: RecordDto | null = null, nextService: RecordDto | null = null) => {
    setProvider(nextProvider);
    setService(nextService);
    setNotice("");
    if (["personal", "cycle", "pregnancy"].includes(endpoint)) {
      requestSequence.current += 1;
      setPath(endpoint);
      setRows([]);
      setCursor(null);
      setBusy(false);
      setError("");
      return;
    }
    void load(endpoint);
  };

  const providerServices = provider ? `providers/${provider.id}/services` : "providers";
  const isServices = path.endsWith("/services");
  const isAvailability = path.endsWith("/availability");
  const heading = path === "privacy/requests"
    ? t("Akaunti na faragha", "Account and privacy")
    : path === "appointments"
      ? actor?.role === "provider" ? t("Ratiba ya miadi", "Appointment schedule") : t("Miadi yako", "Your appointments")
      : path === "payments"
        ? t("Malipo yako", "Your payments")
        : path === "navigator/assignments"
          ? t("Kazi ulizopangiwa", "Assigned work")
          : path === "admin/aggregate"
            ? t("Muhtasari wa huduma", "Service overview")
            : isAvailability
              ? t("Chagua muda", "Choose a time")
              : isServices
                ? actor?.role === "patient" ? t("Chagua huduma", "Choose a service") : t("Huduma zinazopatikana", "Available services")
                : t("Tafuta huduma", "Find care");

  const sectionDescription = path === "providers"
    ? t("Watoa huduma walio hai na kuthibitishwa pekee ndio wanaoonyeshwa.", "Only active, verified care professionals appear here.")
    : isServices
      ? t(`Huduma zinazotolewa na ${provider?.displayName ?? "mtoa huduma huyu"}.`, `Services offered by ${provider?.displayName ?? "this care professional"}.`)
      : isAvailability
        ? t("Muda wote unaonyeshwa kwa saa za Afrika Mashariki.", "All times are shown in East Africa Time.")
        : path === "appointments"
          ? actor?.role === "provider"
            ? t("Ratiba hii inaonyesha muda, aina na hali ya miadi uliyoidhinishwa kuona.", "This schedule shows the time, format, and status of appointments you are authorized to view.")
            : t("Angalia hali ya miadi na ukamilishe hatua zinazohitajika.", "Review appointment status and complete any required next step.")
          : path === "payments"
            ? t("Historia ya malipo inayohusiana na akaunti yako.", "Payment history associated with your account.")
          : path === "privacy/requests"
              ? t("Dhibiti lugha na maombi yanayohusu taarifa zako.", "Manage language and requests concerning your information.")
              : path === "navigator/assignments"
                ? t("Foleni hii ina kazi hai ulizopangiwa; hakuna taarifa binafsi za afya zinazoonyeshwa.", "This queue contains your active assignments; no private health details are shown.")
                : path === "admin/aggregate"
                  ? t("Vipimo vya jumla vya huduma; hakuna rekodi binafsi zinazopatikana hapa.", "Aggregate service measures; no individual records are available here.")
                  : t("Taarifa ulizoidhinishwa kuona.", "Information your account is authorized to view.");

  const roleExperience = actor?.role === "provider"
    ? { label: t("Mtoa huduma", "Care professional"), title: t("Ratiba yako ya huduma", "Your care schedule"), description: t("Angalia miadi inayohusiana na wasifu wako wa huduma.", "Review appointments connected to your professional profile.") }
    : actor?.role === "navigator"
      ? { label: t("Mratibu wa huduma", "Care navigator"), title: t("Kazi za uratibu", "Care coordination"), description: t("Angalia kazi ulizopangiwa na orodha ya huduma iliyoidhinishwa.", "Review your assigned work and the verified care directory.") }
      : actor?.role?.endsWith("admin")
        ? { label: t("Msimamizi", "Administrator"), title: t("Uendeshaji wa mfumo", "System operations"), description: t("Angalia vipimo vya jumla bila kufungua taarifa binafsi za wagonjwa.", "Review aggregate operations without opening private patient records.") }
        : { label: t("Mgonjwa", "Patient"), title: t("Mahali pa huduma yako", "Your care space"), description: t("Tafuta huduma, fuatilia miadi na dhibiti akaunti yako.", "Find care, track appointments, and manage your account.") };

  const statusLabel = (status?: string) => {
    if (!status) return t("Haijulikani", "Unknown");
    const labels: Record<string, [string, string]> = {
      requested: ["Imeombwa", "Requested"],
      confirmed: ["Imethibitishwa", "Confirmed"],
      cancelled: ["Imeghairiwa", "Cancelled"],
      expired: ["Muda umeisha", "Expired"],
      completed: ["Imekamilika", "Completed"],
      no_show: ["Hakuhudhuria", "Did not attend"],
      submitted: ["Imewasilishwa", "Submitted"],
      queued: ["Kwenye foleni", "Queued"],
      paid: ["Imelipwa", "Paid"],
      reserved: ["Imehifadhiwa", "Reserved"],
      failed: ["Imeshindikana", "Failed"],
      refunded: ["Imerejeshwa", "Refunded"],
      sponsored: ["Imedhaminiwa", "Sponsored"],
      open: ["Wazi", "Open"],
      active: ["Hai", "Active"]
    };
    const pair = labels[status.toLowerCase()];
    return pair ? t(pair[0], pair[1]) : t("Hali ya taarifa", "Record status");
  };

  const metricLabel = (name: string) => ({
    activeMembers: t("Wanachama hai", "Active members"),
    appointmentCompletionRate: t("Asilimia ya miadi iliyokamilika", "Appointment completion rate"),
    facilities: t("Vituo vilivyothibitishwa", "Verified facilities")
  }[name] ?? t("Kipimo cha mfumo", "System metric"));

  let navItems: Array<[string, string]> = [];
  if (actor?.role === "patient") navItems = [["personal", t("Leo", "Today")], ["cycle", t("Mzunguko", "Cycle")], ["pregnancy", t("Ujauzito", "Pregnancy")], ["providers", t("Huduma", "Care")], ["appointments", t("Miadi", "Appointments")], ["payments", t("Malipo", "Payments")]];
  else if (actor?.role === "provider") navItems = [["appointments", t("Ratiba", "Schedule")], ["providers", t("Orodha ya huduma", "Care directory")]];
  else if (actor?.role === "navigator") navItems = [["navigator/assignments", t("Kazi", "Assignments")], ["providers", t("Orodha ya huduma", "Care directory")]];
  else if (actor) navItems = [["admin/aggregate", t("Muhtasari", "Overview")]];
  if (actor) navItems.push(["privacy/requests", t("Akaunti", "Account")]);

  const confirmAction = async () => {
    const action = confirmation?.action;
    setConfirmation(null);
    if (action) await action();
  };

  const emptyState = () => {
    if (path === "privacy/requests") return { title: t("Hakuna maombi ya faragha", "No privacy requests"), body: t("Maombi mapya ya nakala au kufuta taarifa yataonekana hapa.", "New data export or deletion requests will appear here.") };
    if (isServices) return { title: t("Hakuna huduma zilizo wazi", "No services are listed"), body: t("Mtoa huduma huyu hana huduma inayoweza kuhifadhiwa kwa sasa.", "This care professional has no bookable service right now."), action: { label: t("Rudi kwa watoa huduma", "Back to care professionals"), endpoint: "providers" } };
    if (isAvailability) return { title: t("Hakuna muda unaopatikana", "No times are available"), body: t("Jaribu huduma nyingine au rudi baadaye kuona muda mpya.", "Try another service or check again later for new times."), action: { label: t("Chagua huduma nyingine", "Choose another service"), endpoint: providerServices } };
    if (path === "appointments") return actor?.role === "provider"
      ? { title: t("Hakuna miadi kwenye ratiba", "No appointments on your schedule"), body: t("Miadi inayohusishwa na wasifu wako itaonekana hapa.", "Appointments connected to your professional profile will appear here.") }
      : { title: t("Bado huna miadi", "You have no appointments yet"), body: t("Anza kwa kuchagua mtoa huduma aliyethibitishwa.", "Start by choosing a verified care professional."), action: actor?.role === "patient" ? { label: t("Tafuta huduma", "Find care"), endpoint: "providers" } : undefined };
    if (path === "payments") return { title: t("Bado hakuna malipo", "No payments yet"), body: t("Malipo yataonekana hapa baada ya kuanzishwa kwa miadi.", "Payments will appear here after they are started for an appointment."), action: { label: t("Angalia miadi", "View appointments"), endpoint: "appointments" } };
    if (path === "navigator/assignments") return { title: t("Hakuna kazi hai", "No active assignments"), body: t("Kazi mpya iliyoidhinishwa itaonekana hapa inapopangwa kwako.", "New authorized work will appear here when it is assigned to you.") };
    return { title: path === "providers" ? t("Hakuna huduma inayopatikana", "No care is available") : t("Hakuna taarifa bado", "Nothing here yet"), body: path === "providers" ? t("Hakuna mtoa huduma aliyethibitishwa anayepatikana kwa sasa.", "No verified care professional is available right now.") : t("Taarifa zitaonekana hapa zikiongezwa kwenye akaunti yako.", "Records will appear here when they are added to your account.") };
  };
  const currentEmptyState = emptyState();
  const displayRows = isAvailability || path === "appointments"
    ? [...rows].sort((first, second) => Date.parse(first.startsAt ?? "") - Date.parse(second.startsAt ?? ""))
    : rows;
  const roleClass = actor?.role?.endsWith("admin") ? "admin" : actor?.role ?? "loading";
  const isPatientSpace = actor?.role === "patient" && ["personal", "cycle", "pregnancy"].includes(path);
  const workspaceLabel = path === "privacy/requests"
    ? t("Mipangilio ya akaunti", "Account controls")
    : path === "admin/aggregate"
      ? t("Takwimu za uendeshaji", "Operational metrics")
    : path === "navigator/assignments"
        ? t("Foleni ya uratibu", "Coordination queue")
        : path === "appointments" && actor?.role === "provider"
          ? t("Ratiba ya mtoa huduma", "Professional schedule")
          : path === "payments"
            ? t("Rekodi za kifedha", "Financial records")
            : isServices && actor?.role !== "patient"
              ? t("Orodha ya huduma", "Care directory")
              : isAvailability || isServices
              ? t("Hatua za kuhifadhi", "Booking flow")
              : t("Huduma iliyothibitishwa", "Verified care");
  const roleIcon = actor?.role === "provider"
    ? <Stethoscope aria-hidden="true" />
    : actor?.role === "navigator"
      ? <ClipboardList aria-hidden="true" />
      : actor?.role?.endsWith("admin")
        ? <BarChart3 aria-hidden="true" />
        : <HeartHandshake aria-hidden="true" />;
  const navIcon = (endpoint: string) => endpoint === "personal"
    ? <HeartHandshake aria-hidden="true" />
    : endpoint === "cycle"
      ? <RefreshCw aria-hidden="true" />
      : endpoint === "pregnancy"
        ? <Baby aria-hidden="true" />
        : endpoint === "providers"
    ? <Stethoscope aria-hidden="true" />
    : endpoint === "appointments"
      ? <CalendarDays aria-hidden="true" />
      : endpoint === "payments"
        ? <WalletCards aria-hidden="true" />
        : endpoint === "navigator/assignments"
          ? <ClipboardList aria-hidden="true" />
          : endpoint === "admin/aggregate"
            ? <BarChart3 aria-hidden="true" />
            : <UserRound aria-hidden="true" />;

  return (
    <div className="live-shell" lang={language}>
      <a className="live-skip" href="#main">{t("Ruka hadi maudhui", "Skip to content")}</a>
      <header className="live-header">
        <Brand />
        {!signedIn ? <nav className="live-public-nav" aria-label={t("Maudhui ya ukurasa", "Page sections")}><a href="#how-it-works">{t("Jinsi inavyofanya kazi", "How it works")}</a><a href="#privacy">{t("Faragha", "Privacy")}</a></nav> : null}
        <div className="live-header-actions">
          <label className="live-language"><Languages aria-hidden="true" /><span>{t("Lugha", "Language")}</span><select aria-label={t("Chagua lugha", "Choose language")} value={language} onChange={(event) => changeLanguage(event.target.value as Language)}><option value="sw">{languageName("sw")}</option><option value="en">{languageName("en")}</option></select></label>
          {signedIn ? <Link href="/logout" className="live-button live-button-ghost">{t("Ondoka", "Sign out")}</Link> : <a className="live-header-signin" href="/auth/login">{t("Ingia", "Sign in")}</a>}
        </div>
      </header>

      <main id="main" className="live-main">
        {notice ? <StatusMessage kind="success" dismissLabel={t("Funga ujumbe", "Dismiss message")} onDismiss={() => setNotice("")}>{notice}</StatusMessage> : null}
        {error ? <StatusMessage kind="error"><p>{error}</p><button type="button" className="live-inline-action" onClick={() => signedIn ? void load(path) : router.push("/auth/login")}>{signedIn ? t("Jaribu tena", "Try again") : t("Ingia tena", "Sign in again")}</button></StatusMessage> : null}

        {!signedIn ? (
          <>
            <section className="live-hero" aria-labelledby="welcome-title">
              <div className="live-hero-copy">
                <div className="live-kicker"><LockKeyhole aria-hidden="true" /> {t("Huduma kwa faragha", "Private care access")}</div>
                <h1 id="welcome-title">{t("Huduma unayoielewa. Chaguo unalodhibiti.", "Care you can understand. Choices you control.")}</h1>
                <p className="live-lead">{t("Tafuta mtoa huduma aliyethibitishwa, elewa bei kabla ya kuhifadhi, na fuatilia miadi kwa lugha uliyochagua.", "Find verified care, understand the price before booking, and track appointments in your selected language.")}</p>
                <div className="live-hero-actions"><a className="live-primary" href="/auth/login">{t("Anza kwa usalama", "Get started securely")} <ArrowRight aria-hidden="true" /></a><a className="live-text-link" href="#how-it-works">{t("Ona hatua tatu", "See the three steps")}</a></div>
                <p className="live-auth-note"><ShieldCheck aria-hidden="true" /> <span>{t("Wagonjwa wanaweza kujisajili. Watoa huduma, waratibu na wasimamizi huingia kwa akaunti zilizoalikwa.", "Patients can create an account. Care professionals, navigators, and administrators sign in with invited accounts.")}</span></p>
                {localRolePreview ? <div className="live-role-preview"><p>{t("Onyesho la ndani: chagua akaunti ya kujaribu", "Local preview: choose an account to test")}</p><div><a href="/auth/login?role=patient">{t("Mgonjwa", "Patient")}</a><a href="/auth/login?role=provider">{t("Mtoa huduma", "Care professional")}</a><a href="/auth/login?role=navigator">{t("Mratibu", "Navigator")}</a><a href="/auth/login?role=platform-admin">{t("Msimamizi", "Administrator")}</a></div></div> : null}
              </div>
              <aside className="live-hero-panel" aria-label={t("Ahadi ya huduma", "Care promise")}>
                <span className="live-panel-icon"><HeartHandshake aria-hidden="true" /></span><p className="live-overline">{t("Kabla ya kuthibitisha", "Before you confirm")}</p><h2>{t("Muda, aina ya huduma na bei vinaonekana pamoja.", "Time, care format, and price appear together.")}</h2>
                <ul><li><Check aria-hidden="true" /> {t("Watoa huduma waliothibitishwa", "Verified care professionals")}</li><li><Check aria-hidden="true" /> {t("Muda wa Afrika Mashariki", "East Africa Time")}</li><li><Check aria-hidden="true" /> {t("Hali ya miadi iliyo wazi", "Clear appointment status")}</li></ul>
              </aside>
            </section>
            <section className="live-trust-strip" aria-label={t("Misingi ya huduma", "Service foundations")}>
              <div><ShieldCheck aria-hidden="true" /><span><strong>{t("Uthibitisho", "Verification")}</strong>{t("Orodha ina watoa huduma hai waliothibitishwa.", "The directory filters for active, verified professionals.")}</span></div>
              <div><Languages aria-hidden="true" /><span><strong>{t("Chaguo la lugha", "Language choice")}</strong>{t("Badili lugha ya mfumo wakati wowote.", "Switch the interface language at any time.")}</span></div>
              <div><LockKeyhole aria-hidden="true" /><span><strong>{t("Faragha", "Privacy")}</strong>{t("Maombi ya taarifa yanafuatiliwa kwenye akaunti yako.", "Data requests are tracked in your account.")}</span></div>
            </section>
            <section className="live-content-section" id="how-it-works" aria-labelledby="how-title">
              <div className="live-section-intro"><p className="live-overline">{t("Hatua kwa hatua", "Step by step")}</p><h2 id="how-title">{t("Kutoka kutafuta hadi miadi", "From search to appointment")}</h2><p>{t("Kila hatua inaonyesha chaguo muhimu kabla ya kuendelea.", "Each step shows the information you need before moving forward.")}</p></div>
              <ol className="live-step-grid"><li><span>01</span><Stethoscope aria-hidden="true" /><h3>{t("Chagua mtoa huduma", "Choose care")}</h3><p>{t("Angalia jina, utaalamu na lugha.", "Review the professional, specialty, and languages.")}</p></li><li><span>02</span><CalendarDays aria-hidden="true" /><h3>{t("Chagua huduma na muda", "Choose service and time")}</h3><p>{t("Linganisha aina ya huduma, eneo na bei.", "Compare the care format, location, and price.")}</p></li><li><span>03</span><Check aria-hidden="true" /><h3>{t("Kagua na uthibitishe", "Review and confirm")}</h3><p>{t("Fuata hali ya miadi kwenye akaunti yako.", "Track the appointment status in your account.")}</p></li></ol>
            </section>
            <section className="live-privacy-section" id="privacy" aria-labelledby="privacy-title"><div><p className="live-overline">{t("Faragha kwa vitendo", "Privacy in practice")}</p><h2 id="privacy-title">{t("Akaunti yako, maombi yako.", "Your account, your requests.")}</h2></div><div><p>{t("Unaweza kuona miadi na malipo yaliyoidhinishwa kwa akaunti yako, kuhifadhi lugha unayopendelea, na kuomba nakala au kufutwa kwa taarifa.", "You can view appointments and payments authorized for your account, save your preferred language, and request a data copy or deletion.")}</p><p className="live-emergency"><CircleAlert aria-hidden="true" /> {t("MWANAMKE si huduma ya dharura. Tafuta huduma za dharura za eneo lako unapohitaji msaada wa haraka.", "MWANAMKE is not an emergency service. Use local emergency services when you need urgent help.")}</p></div></section>
          </>
        ) : (
          <div className={`live-app-layout live-role-${roleClass}`}>
            <aside className="live-sidebar">
              <div className="live-account-summary"><span><LockKeyhole aria-hidden="true" /></span><div><small>{t("Akaunti salama", "Secure account")}</small><strong>{actor ? t("Imeunganishwa", "Connected") : t("Inathibitisha", "Verifying")}</strong></div></div>
              {actor ? <nav aria-label={t("Sehemu za huduma", "Care sections")}>{navItems.map(([endpoint, label]) => { const active = path === endpoint || (endpoint === "providers" && path.startsWith("providers/")); return <button type="button" key={endpoint} aria-current={active ? "page" : undefined} onClick={() => navigate(endpoint, null, null)}>{navIcon(endpoint)}{label}</button>; })}</nav> : null}
              <p className="live-sidebar-note"><ShieldCheck aria-hidden="true" /> {t("Taarifa kutoka kwenye akaunti yako pekee.", "Information authorized for your account only.")}</p>
            </aside>
            <div className="live-workspace">
              {isPatientSpace ? <PatientSpace language={language} view={path as PatientView} onNavigate={(next) => navigate(next)} onOpenAppointments={() => navigate("appointments")} onBrowseCare={() => navigate("providers")} /> : <>
              <section className="live-dashboard-intro">
                <span className="live-dashboard-icon">{roleIcon}</span>
                <div className="live-dashboard-copy"><div className="live-kicker">{t("Karibu tena", "Welcome back")}</div><h1>{roleExperience.title}</h1><p>{roleExperience.description}</p></div>
                <span className="live-role-chip">{actor ? roleExperience.label : t("Inapakia", "Loading")}</span>
              </section>
              <section className="live-data-section" aria-busy={busy}>
                {isServices || isAvailability ? <nav className="live-breadcrumbs" aria-label={actor?.role === "patient" ? t("Njia ya kuhifadhi", "Booking path") : t("Njia ya orodha ya huduma", "Care directory path")}><button type="button" onClick={() => navigate("providers", null, null)}>{t("Watoa huduma", "Care professionals")}</button><span aria-hidden="true">/</span>{isAvailability ? <><button type="button" onClick={() => navigate(providerServices, provider, null)}>{provider?.displayName}</button><span aria-hidden="true">/</span><strong>{t("Muda", "Times")}</strong></> : <strong>{provider?.displayName}</strong>}</nav> : null}
                <div className="live-section-heading"><div><p className="live-overline">{workspaceLabel}</p><h2>{heading}</h2><p>{sectionDescription}</p></div><Button variant="ghost" disabled={busy} onClick={() => void load(path)}><RefreshCw aria-hidden="true" /> {t("Sasisha", "Refresh")}</Button></div>

                {path === "privacy/requests" ? <div className="live-account-grid">
                  <section className="live-card"><p className="live-card-eyebrow">{t("Mapendeleo", "Preference")}</p><h3>{t("Lugha ya akaunti", "Account language")}</h3><dl className="live-definition"><div><dt>{t("Iliyohifadhiwa", "Saved")}</dt><dd>{savedLanguage ? languageName(savedLanguage) : "—"}</dd></div><div><dt>{t("Iliyochaguliwa", "Selected")}</dt><dd>{languageName(language)}</dd></div></dl><Button variant="primary" disabled={busy || savedLanguage === language} onClick={() => void mutate("profile", { preferredLanguage: language }, "PATCH")}>{savedLanguage === language ? t("Lugha imehifadhiwa", "Language is saved") : t("Hifadhi lugha hii", "Save this language")}</Button></section>
                  <section className="live-card"><p className="live-card-eyebrow">{t("Haki za taarifa", "Data rights")}</p><h3>{t("Omba nakala au kufutwa", "Request a copy or deletion")}</h3><p>{t("Timu ya faragha itathibitisha na kushughulikia ombi. Kutuma ombi hakufuti wala kutuma taarifa papo hapo.", "The privacy team will verify and process the request. Submission does not immediately delete or send information.")}</p><div className="live-action-row"><Button disabled={busy} onClick={() => void mutate("privacy/requests", { kind: "export", idempotencyKey: crypto.randomUUID() })}>{t("Omba nakala", "Request a copy")}</Button><Button variant="danger" disabled={busy} onClick={() => setConfirmation({ title: t("Omba kufutwa kwa akaunti?", "Request account deletion?"), body: t("Hili litatuma ombi kwa timu ya faragha. Akaunti yako haitafutwa papo hapo.", "This sends a request to the privacy team. Your account will not be deleted immediately."), confirmLabel: t("Tuma ombi", "Send request"), tone: "danger", action: () => mutate("privacy/requests", { kind: "deletion", idempotencyKey: crypto.randomUUID() }) })}>{t("Omba kufutwa", "Request deletion")}</Button></div></section>
                </div> : null}

                {path === "privacy/requests" ? <div className="live-subsection-heading"><div><h3>{t("Historia ya maombi", "Request history")}</h3><p>{t("Hali ya maombi uliyowasilisha kupitia akaunti hii.", "Status of requests submitted from this account.")}</p></div></div> : null}

                {busy && rows.length === 0 ? <Skeletons label={t("Inapakia", "Loading")} /> : null}
                {!busy && !error && rows.length === 0 && path === "privacy/requests" ? <div className="live-history-empty"><ShieldCheck aria-hidden="true" /><div><strong>{currentEmptyState.title}</strong><p>{currentEmptyState.body}</p></div></div> : null}
                {!busy && !error && rows.length === 0 && path !== "admin/aggregate" && path !== "privacy/requests" ? <div className="live-empty"><span><CalendarDays aria-hidden="true" /></span><h3>{currentEmptyState.title}</h3><p>{currentEmptyState.body}</p>{currentEmptyState.action ? <Button variant="primary" onClick={() => navigate(currentEmptyState.action!.endpoint, currentEmptyState.action!.endpoint === providerServices ? provider : null, null)}>{currentEmptyState.action.label}<ArrowRight aria-hidden="true" /></Button> : null}</div> : null}

                {!busy || rows.length > 0 ? <div className={path === "providers" || isServices || isAvailability ? "live-grid" : "live-record-list"}>{displayRows.map((row) => {
                  if (path === "providers") return <article className="live-card" key={row.id}><div className="live-card-topline"><span className="live-verified"><ShieldCheck aria-hidden="true" />{t("Amethibitishwa", "Verified")}</span></div><h3>{row.displayName}</h3><p className="live-card-lead">{language === "sw" ? row.titleSw : row.titleEn}</p><p className="live-meta"><Languages aria-hidden="true" /> {row.languages?.length ? row.languages.map(languageName).join(", ") : t("Lugha haijatajwa", "Languages not listed")}</p><Button className="live-card-action" onClick={() => navigate(`providers/${row.id}/services`, row, null)}>{actor?.role === "patient" ? t("Ona huduma na bei", "View services and prices") : t("Ona huduma", "View services")}<ArrowRight aria-hidden="true" /></Button></article>;
                  if (isServices) return <article className="live-card" key={row.id}><p className="live-card-eyebrow">{row.mode === "virtual" ? t("Mtandaoni", "Online") : t("Ana kwa ana", "In person")}</p><h3>{language === "sw" ? row.nameSw : row.nameEn}</h3><p className="live-price">{formatMoney(row.priceTzs)}</p><p className="live-meta"><MapPin aria-hidden="true" /> {language === "sw" ? row.facility?.nameSw : row.facility?.nameEn}{row.facility?.locality ? ` — ${row.facility.locality}` : ""}</p>{row.facility?.accessibilityEn || row.facility?.accessibilitySw ? <p className="live-small">{language === "sw" ? row.facility?.accessibilitySw : row.facility?.accessibilityEn}</p> : null}{actor?.role === "patient" ? <Button variant="primary" className="live-card-action" disabled={busy} onClick={() => navigate(`providers/${provider!.id}/availability`, provider, row)}>{t("Chagua muda", "Choose a time")}<ArrowRight aria-hidden="true" /></Button> : <p className="live-card-note"><ShieldCheck aria-hidden="true" />{t("Kwa marejeo ya orodha ya huduma", "Directory reference")}</p>}</article>;
                  if (isAvailability) return <article className="live-card" key={row.id}><div className="live-card-topline"><span className="live-status">{row.mode === "virtual" ? t("Mtandaoni", "Online") : t("Ana kwa ana", "In person")}</span></div><h3>{formatDate(row.startsAt!)}</h3><p className="live-meta"><Clock3 aria-hidden="true" />{t("Saa za Afrika Mashariki", "East Africa Time")}</p>{service && actor?.role === "patient" && row.mode === service.mode ? <><div className="live-selection-summary"><span>{language === "sw" ? service.nameSw : service.nameEn}</span><strong>{formatMoney(service.priceTzs)}</strong></div><Button variant="primary" className="live-card-action" disabled={busy} onClick={() => setConfirmation({ title: t("Hifadhi muda huu?", "Hold this appointment time?"), body: t(`${formatDate(row.startsAt!)} utahifadhiwa kwa dakika 15 ili ukamilishe hatua zinazofuata.`, `${formatDate(row.startsAt!)} will be held for 15 minutes while you complete the next steps.`), confirmLabel: t("Hifadhi muda", "Hold time"), action: () => mutate("appointments", { slotId: row.id, serviceId: service.id, mode: row.mode, idempotencyKey: crypto.randomUUID() }) })}>{t("Kagua na uhifadhi", "Review and hold")}<ArrowRight aria-hidden="true" /></Button></> : null}</article>;
                  if (path === "appointments") return <article className="live-record-row" key={row.id}><div className="live-record-icon"><CalendarDays aria-hidden="true" /></div><div className="live-record-main"><div className="live-record-title"><h3>{formatDate(row.startsAt!)}</h3><span className={`live-status live-status-${row.status ?? "unknown"}`}>{statusLabel(row.status)}</span></div><div className="live-record-meta"><span>{row.mode === "virtual" ? t("Mtandaoni", "Online") : t("Ana kwa ana", "In person")}</span><span>{t("Saa za Afrika Mashariki", "East Africa Time")}</span>{row.amountTzs !== undefined ? <strong>{formatMoney(row.amountTzs, row.currency)}</strong> : null}</div>{actor?.role === "patient" && row.holdExpiresAt && row.status === "requested" ? <p className="live-hold-note"><Clock3 aria-hidden="true" />{t("Muda wa kuhifadhi unaisha", "Hold expires")} {new Date(row.holdExpiresAt).toLocaleTimeString(language === "sw" ? "sw-TZ" : "en-GB")}</p> : null}{actor?.role === "patient" && row.status === "requested" && (row.amountTzs ?? 0) > 0 ? <p className="live-warning"><CircleAlert aria-hidden="true" />{t("Malipo bado hayapatikani kwenye toleo hili. Miadi haijathibitishwa.", "Payment is not available in this release. The appointment is not confirmed.")}</p> : null}</div>{actor?.role === "patient" && ["requested", "confirmed"].includes(row.status ?? "") ? <div className="live-record-actions">{row.status === "requested" && row.amountTzs === 0 ? <Button variant="primary" disabled={busy} onClick={() => setConfirmation({ title: t("Thibitisha miadi?", "Confirm this appointment?"), body: t("Kagua muda hapo juu. Miadi hii haina malipo.", "Review the time above. This appointment has no charge."), confirmLabel: t("Thibitisha miadi", "Confirm appointment"), action: () => mutate(`appointments/${row.id}/confirm`, {}) })}>{t("Thibitisha", "Confirm")}</Button> : null}<Button variant="danger" disabled={busy} onClick={() => setConfirmation({ title: t("Ghairi miadi?", "Cancel this appointment?"), body: t("Muda huu utaachiliwa. Malipo yoyote yatahitaji kushughulikiwa kwa sera ya mtoa huduma.", "This time will be released. Any payment will be handled under the care provider's policy."), confirmLabel: t("Ghairi miadi", "Cancel appointment"), tone: "danger", action: () => mutate(`appointments/${row.id}/cancel`, {}) })}>{t("Ghairi", "Cancel")}</Button></div> : null}</article>;
                  if (path === "payments") return <article className="live-record-row" key={row.id}><div className="live-record-icon"><WalletCards aria-hidden="true" /></div><div className="live-record-main"><div className="live-record-title"><h3>{t("Malipo", "Payment")} #{row.id.slice(-6).toUpperCase()}</h3><span className={`live-status live-status-${row.status ?? "unknown"}`}>{statusLabel(row.status)}</span></div><div className="live-record-meta"><span>{row.createdAt ? formatDate(row.createdAt) : "—"}</span><span>{t("Imeunganishwa na miadi yako", "Linked to your appointment")}</span></div></div><strong className="live-record-amount">{formatMoney(row.amountTzs, row.currency)}</strong></article>;
                  if (path === "navigator/assignments") return <article className="live-record-row" key={row.id}><div className="live-record-icon"><ClipboardList aria-hidden="true" /></div><div className="live-record-main"><div className="live-record-title"><h3>{t("Kazi", "Assignment")} #{row.id.slice(-6).toUpperCase()}</h3><span className={`live-status live-status-${row.status ?? "unknown"}`}>{statusLabel(row.status)}</span></div><div className="live-record-meta"><span>{t("Ilipangwa", "Assigned")} {row.assignedAt ? formatDate(row.assignedAt) : "—"}</span><span>{t("Kazi iliyoidhinishwa", "Authorized work item")}</span></div></div></article>;
                  return <article className="live-record-row" key={row.id}><div className="live-record-icon"><ShieldCheck aria-hidden="true" /></div><div className="live-record-main"><div className="live-record-title"><h3>{row.kind === "export" ? t("Ombi la nakala", "Data copy request") : t("Ombi la kufuta", "Deletion request")}</h3><span className={`live-status live-status-${row.status ?? "unknown"}`}>{statusLabel(row.status)}</span></div><div className="live-record-meta"><span>{t("Iliwasilishwa", "Submitted")} {row.createdAt ? formatDate(row.createdAt) : "—"}</span></div></div></article>;
                })}</div> : null}

                {path === "admin/aggregate" && Object.keys(metrics).length > 0 ? <><dl className="live-metric-grid">{["activeMembers", "facilities", "appointmentCompletionRate"].map((name) => { const value = metrics[name]; return <div className="live-card" key={name}><dt>{metricLabel(name)}</dt><dd>{name === "appointmentCompletionRate" ? new Intl.NumberFormat(language === "sw" ? "sw-TZ" : "en-GB", { style: "percent", maximumFractionDigits: 1 }).format(value ?? 0) : (value ?? 0).toLocaleString(language === "sw" ? "sw-TZ" : "en-GB")}</dd></div>; })}</dl><div className="live-data-boundary"><LockKeyhole aria-hidden="true" /><div><strong>{t("Mipaka ya taarifa", "Data boundary")}</strong><p>{t("Dashibodi hii inaonyesha vipimo vitatu vya jumla pekee. Rekodi binafsi za wagonjwa hazipatikani kwenye njia hii.", "This dashboard exposes only three aggregate measures. Individual patient records are unavailable on this route.")}</p></div></div></> : null}
                {cursor ? <Button className="live-load-more" disabled={busy} onClick={() => void load(path, cursor)}>{t("Onyesha zaidi", "Load more")}</Button> : null}
              </section>
              </>}
            </div>
          </div>
        )}
      </main>

      <footer className="live-footer"><Brand /><p>{t("Huduma hii si ya dharura.", "This is not an emergency service.")}</p><p>© {new Date().getFullYear()} MWANAMKE</p></footer>

      {confirmation ? <div className="live-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmation(null); }}><section ref={dialogRef} className="live-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmation-title" tabIndex={-1}><span className={`live-dialog-icon ${confirmation.tone === "danger" ? "danger" : ""}`}><CircleAlert aria-hidden="true" /></span><h2 id="confirmation-title">{confirmation.title}</h2><p>{confirmation.body}</p><div className="live-dialog-actions"><Button onClick={() => setConfirmation(null)}>{t("Rudi", "Go back")}</Button><Button variant={confirmation.tone === "danger" ? "danger" : "primary"} onClick={() => void confirmAction()}>{confirmation.confirmLabel}</Button></div></section></div> : null}
    </div>
  );
}
