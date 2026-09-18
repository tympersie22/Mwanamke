"use client";

import { useState } from "react";
import {
  Activity,
  ArrowRight,
  Baby,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Droplets,
  HeartPulse,
  LockKeyhole,
  Moon,
  Plus,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  SunMedium,
  TrendingUp
} from "lucide-react";

export type PatientView = "personal" | "cycle" | "pregnancy";
type Language = "sw" | "en";
type LifeStage = "cycle" | "pregnancy" | "postpartum" | "perimenopause";

const recordedDays = new Set([2, 3, 4, 5, 6]);
const estimatedDays = new Set([29, 30, 31]);
const fertileDays = new Set([13, 14, 15, 16, 17, 18]);

export function PatientSpace({
  language,
  view,
  onNavigate,
  onOpenAppointments,
  onBrowseCare
}: {
  language: Language;
  view: PatientView;
  onNavigate: (view: PatientView) => void;
  onOpenAppointments: () => void;
  onBrowseCare: () => void;
}) {
  const t = (sw: string, en: string) => (language === "sw" ? sw : en);
  const [stage, setStage] = useState<LifeStage>(view === "pregnancy" ? "pregnancy" : "cycle");
  const [flow, setFlow] = useState("none");
  const [mood, setMood] = useState("steady");
  const [symptoms, setSymptoms] = useState<Set<string>>(new Set(["cramps"]));
  const [saved, setSaved] = useState(false);
  const [urgentOpen, setUrgentOpen] = useState(false);
  const [monthIndex, setMonthIndex] = useState(1);
  const [selectedDay, setSelectedDay] = useState(14);

  const toggleSymptom = (value: string) => {
    setSaved(false);
    setSymptoms((current) => {
      const next = new Set(current);
      if (value === "none") return new Set(["none"]);
      next.delete("none");
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const months = [
    { sw: "Agosti 2026", en: "August 2026", days: 31, offset: 5 },
    { sw: "Septemba 2026", en: "September 2026", days: 30, offset: 1 },
    { sw: "Oktoba 2026", en: "October 2026", days: 31, offset: 3 }
  ];
  const month = months[monthIndex]!;
  const calendarDays = Array.from({ length: 42 }, (_, index) => index - month.offset + 1);

  const stageCopy: Record<LifeStage, { label: string; headline: string; body: string; metric: string; detail: string }> = {
    cycle: {
      label: t("Mzunguko wangu", "My cycle"),
      headline: t("Siku ya 13", "Cycle day 13"),
      body: t("Hedhi inayofuata inakadiriwa ndani ya siku 15–18.", "Your next period is estimated in 15–18 days."),
      metric: t("Dirisha la rutuba", "Fertile window"),
      detail: t("Linaendelea sasa kwa makadirio", "Estimated to be active now")
    },
    pregnancy: {
      label: t("Ujauzito wangu", "My pregnancy"),
      headline: t("Wiki 24 + siku 3", "24 weeks + 3 days"),
      body: t("Muhula wa pili · Tarehe inayokadiriwa 29 Desemba.", "Second trimester · Estimated due date 29 December."),
      metric: t("Ziara ijayo", "Next antenatal visit"),
      detail: t("Jumatano · saa 3:30 asubuhi", "Wednesday · 9:30 AM")
    },
    postpartum: {
      label: t("Baada ya kujifungua", "Postpartum"),
      headline: t("Wiki ya 5 ya kupona", "Recovery week 5"),
      body: t("Fuatilia kupona, hisia, usingizi na ulishaji kwa sehemu moja.", "Track recovery, mood, sleep, and feeding in one calm space."),
      metric: t("Ukaguzi ujao", "Next check-in"),
      detail: t("Baada ya siku 8 · kliniki", "In 8 days · at the clinic")
    },
    perimenopause: {
      label: t("Mabadiliko ya maisha", "Perimenopause"),
      headline: t("Muhtasari wa siku 30", "Your 30-day pattern"),
      body: t("Linganisha usingizi, joto la mwili, hisia na mzunguko bila kubashiri.", "Compare sleep, hot flushes, mood, and cycle changes without guesswork."),
      metric: t("Mabadiliko yanayoonekana", "Pattern noticed"),
      detail: t("Usingizi mdogo kabla ya hedhi", "Less sleep before your period")
    }
  };

  const stageLabels: Array<[LifeStage, string]> = [
    ["cycle", t("Mzunguko", "Cycle")],
    ["pregnancy", t("Ujauzito", "Pregnancy")],
    ["postpartum", t("Baada ya kujifungua", "Postpartum")],
    ["perimenopause", t("Kuelekea ukomo wa hedhi", "Perimenopause")]
  ];

  const symptomOptions: Array<[string, string]> = [
    ["cramps", t("Maumivu ya tumbo", "Cramps")],
    ["headache", t("Kichwa", "Headache")],
    ["bloating", t("Kuvimba", "Bloating")],
    ["tenderness", t("Matiti", "Tender breasts")],
    ["backache", t("Mgongo", "Backache")],
    ["none", t("Hakuna", "None")]
  ];

  const quickLog = (
    <section className="patient-card patient-checkin" aria-labelledby="daily-checkin-title">
      <div className="patient-card-heading">
        <div>
          <p className="patient-eyebrow"><Sparkles aria-hidden="true" />{t("Dakika moja", "One minute")}</p>
          <h3 id="daily-checkin-title">{t("Ukoje leo?", "How are you today?")}</h3>
        </div>
        <span>{t("14 Septemba", "14 Sep")}</span>
      </div>
      <div className="patient-log-section">
        <span className="patient-log-label"><Droplets aria-hidden="true" />{t("Mtiririko", "Flow")}</span>
        <div className="patient-choice-row" role="group" aria-label={t("Chagua kiwango cha mtiririko", "Choose flow level")}>
          {([ ["none", t("Hakuna", "None")], ["light", t("Kidogo", "Light")], ["medium", t("Wastani", "Medium")], ["heavy", t("Mwingi", "Heavy")] ] as Array<[string, string]>).map(([value, label]) => (
            <button type="button" key={value} aria-pressed={flow === value} onClick={() => { setFlow(value); setSaved(false); }}>{label}</button>
          ))}
        </div>
      </div>
      <div className="patient-log-section">
        <span className="patient-log-label"><SunMedium aria-hidden="true" />{t("Hisia", "Mood")}</span>
        <div className="patient-mood-row" role="group" aria-label={t("Chagua hisia", "Choose mood")}>
          {([ ["low", "○", t("Chini", "Low")], ["steady", "◡", t("Sawa", "Steady")], ["good", "⌣", t("Nzuri", "Good")], ["great", "✦", t("Bora", "Great")] ] as Array<[string, string, string]>).map(([value, symbol, label]) => (
            <button type="button" key={value} aria-label={label} aria-pressed={mood === value} onClick={() => { setMood(value); setSaved(false); }}><span aria-hidden="true">{symbol}</span>{label}</button>
          ))}
        </div>
      </div>
      <div className="patient-log-section">
        <span className="patient-log-label"><Activity aria-hidden="true" />{t("Dalili", "Symptoms")}</span>
        <div className="patient-chip-row" role="group" aria-label={t("Chagua dalili", "Choose symptoms")}>
          {symptomOptions.map(([value, label]) => <button type="button" key={value} aria-pressed={symptoms.has(value)} onClick={() => toggleSymptom(value)}>{symptoms.has(value) ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}{label}</button>)}
        </div>
      </div>
      <button type="button" className="patient-save" onClick={() => setSaved(true)}>{saved ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}{saved ? t("Imehifadhiwa kwa kipindi hiki", "Saved for this session") : t("Hifadhi kumbukumbu ya leo", "Save today’s check-in")}</button>
      <p className="patient-local-note" aria-live="polite"><LockKeyhole aria-hidden="true" />{t("Onyesho hili halishiriki kumbukumbu zako na mhudumu.", "This preview does not share your check-in with a care professional.")}</p>
    </section>
  );

  if (view === "cycle") {
    return (
      <div className="patient-space patient-enter">
        <header className="patient-page-head">
          <div><p className="patient-eyebrow"><Droplets aria-hidden="true" />{t("Mzunguko wangu", "My cycle")}</p><h1>{t("Kalenda na mienendo", "Calendar & patterns")}</h1><p>{t("Ona ulichoandika, makadirio na mabadiliko yanayojirudia.", "See what you logged, estimated ranges, and changes over time.")}</p></div>
          <button type="button" className="patient-primary-action" onClick={() => onNavigate("personal")}><Plus aria-hidden="true" />{t("Rekodi leo", "Log today")}</button>
        </header>
        <div className="patient-cycle-grid">
          <section className="patient-card patient-calendar" aria-labelledby="calendar-title">
            <div className="patient-card-heading"><div><p className="patient-eyebrow">{t("Kalenda", "Calendar")}</p><h3 id="calendar-title">{language === "sw" ? month.sw : month.en}</h3></div><div className="patient-month-buttons"><button type="button" disabled={monthIndex === 0} onClick={() => { setMonthIndex((value) => Math.max(0, value - 1)); setSelectedDay(1); }} aria-label={t("Mwezi uliopita", "Previous month")}>‹</button><button type="button" disabled={monthIndex === months.length - 1} onClick={() => { setMonthIndex((value) => Math.min(months.length - 1, value + 1)); setSelectedDay(1); }} aria-label={t("Mwezi ujao", "Next month")}>›</button></div></div>
            <div className="patient-weekdays" aria-hidden="true">{(language === "sw" ? ["J2", "J3", "J4", "J5", "Al", "Ij", "Jp"] : ["M", "T", "W", "T", "F", "S", "S"]).map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
            <div className="patient-days">
              {calendarDays.map((day, index) => day < 1 || day > month.days ? <span key={`blank-${index}`} /> : <button type="button" key={day} aria-pressed={selectedDay === day} onClick={() => setSelectedDay(day)} className={`${monthIndex === 1 && recordedDays.has(day) ? "is-recorded" : ""} ${monthIndex === 1 && estimatedDays.has(day) ? "is-estimated" : ""} ${monthIndex === 1 && fertileDays.has(day) ? "is-fertile" : ""} ${monthIndex === 1 && day === 14 ? "is-today" : ""} ${selectedDay === day ? "is-selected" : ""}`} aria-label={`${day} ${language === "sw" ? month.sw : month.en}`}>{day}</button>)}
            </div>
            <div className="patient-calendar-key"><span><i className="recorded" />{t("Hedhi iliyorekodiwa", "Recorded period")}</span><span><i className="fertile" />{t("Dirisha la rutuba linalokadiriwa", "Estimated fertile window")}</span><span><i className="estimated" />{t("Hedhi inayokadiriwa", "Estimated period")}</span></div>
          </section>
          <aside className="patient-cycle-summary">
            <section className="patient-card patient-cycle-day"><span className="patient-orbit"><strong>13</strong><small>{t("siku", "day")}</small></span><div><p className="patient-eyebrow">{t("Leo", "Today")}</p><h3>{t("Awamu ya ukuaji", "Follicular phase")}</h3><p>{t("Nishati inaweza kuongezeka katika siku zinazofuata.", "Your energy may rise over the next few days.")}</p></div></section>
            <section className="patient-card patient-mini-stats"><div><span>29</span><small>{t("wastani wa siku", "day average")}</small></div><div><span>5</span><small>{t("siku za hedhi", "period days")}</small></div><div><span>3</span><small>{t("mizunguko iliyorekodiwa", "cycles logged")}</small></div></section>
            <section className="patient-card patient-pattern"><div className="patient-card-heading"><div><p className="patient-eyebrow"><TrendingUp aria-hidden="true" />{t("Mwenendo", "Pattern")}</p><h3>{t("Nguvu kwa siku 7", "Energy over 7 days")}</h3></div></div><div className="patient-bars" aria-label={t("Chati ya nguvu ya siku saba", "Seven-day energy chart")}>{[42, 55, 48, 66, 72, 78, 70].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div></section>
          </aside>
        </div>
        <p className="patient-disclaimer"><CircleAlert aria-hidden="true" />{t("Makadirio hutegemea kumbukumbu zako. Si uchunguzi wa ugonjwa na yasitumike kama njia ya kuzuia mimba.", "Predictions are based on your records. They are not a diagnosis and must not be used as contraception.")}</p>
      </div>
    );
  }

  if (view === "pregnancy") {
    return (
      <div className="patient-space patient-enter">
        <header className="patient-page-head"><div><p className="patient-eyebrow"><Baby aria-hidden="true" />{t("Ujauzito wangu", "My pregnancy")}</p><h1>{t("Wiki 24, kwa utulivu", "Week 24, at a glance")}</h1><p>{t("Hatua yako, ziara zako na vitu muhimu vya leo katika sehemu moja.", "Your stage, visits, and today’s essentials in one place.")}</p></div><span className="patient-private-badge"><LockKeyhole aria-hidden="true" />{t("Binafsi", "Private")}</span></header>
        <section className="patient-pregnancy-hero">
          <div className="patient-pregnancy-copy"><span>{t("Muhula wa pili", "Second trimester")}</span><h2>{t("Wiki 24 + siku 3", "24 weeks + 3 days")}</h2><p>{t("Tarehe inayokadiriwa ya kujifungua", "Estimated due date")} <strong>{t("29 Desemba 2026", "29 December 2026")}</strong></p><small>{t("Tarehe hii ni makadirio. Mhudumu wako atathibitisha tarehe za huduma.", "This is an estimate. Your care professional will confirm your clinical dates.")}</small></div>
          <div className="patient-pregnancy-ring" aria-label={t("Asilimia 61 ya ujauzito", "61 percent through pregnancy")}><div><Baby aria-hidden="true" /><strong>61%</strong><small>{t("imefika", "complete")}</small></div></div>
        </section>
        <div className="patient-pregnancy-grid">
          <section className="patient-card patient-next-visit"><div className="patient-card-heading"><div><p className="patient-eyebrow"><CalendarDays aria-hidden="true" />{t("Huduma ijayo", "Next care")}</p><h3>{t("Ziara ya kliniki ya wajawazito", "Antenatal visit")}</h3></div><span>{t("Siku 2", "2 days")}</span></div><p>{t("Jumatano, 16 Septemba · saa 3:30 asubuhi", "Wednesday, 16 September · 9:30 AM")}</p><strong>{t("Kliniki ya Wanawake Bahari · Mkunazini", "Bahari Women’s Clinic · Mkunazini")}</strong><button type="button" onClick={onOpenAppointments}>{t("Angalia maelezo ya miadi", "View appointment details")}<ChevronRight aria-hidden="true" /></button></section>
          <section className="patient-card patient-today-list"><div className="patient-card-heading"><div><p className="patient-eyebrow"><HeartPulse aria-hidden="true" />{t("Leo", "Today")}</p><h3>{t("Vitu vitatu vya kuzingatia", "Three gentle priorities")}</h3></div></div><ul><li><Check aria-hidden="true" /><span><strong>{t("Dawa na virutubisho", "Medicine & supplements")}</strong><small>{t("Fuata maelekezo ya mhudumu wako", "Follow your care professional’s instructions")}</small></span></li><li><Moon aria-hidden="true" /><span><strong>{t("Usingizi na nguvu", "Sleep & energy")}</strong><small>{t("Rekodi ulivyolala na unavyojisikia", "Log how you slept and feel")}</small></span></li><li><Activity aria-hidden="true" /><span><strong>{t("Harakati za mtoto", "Baby movement")}</strong><small>{t("Ukiona mabadiliko, wasiliana na mhudumu", "Contact care if movement changes")}</small></span></li></ul></section>
        </div>
        <section className="patient-card patient-care-plan"><div className="patient-card-heading"><div><p className="patient-eyebrow"><Stethoscope aria-hidden="true" />{t("Mpango wa huduma", "Care plan")}</p><h3>{t("Ziara 8 za kliniki", "8 antenatal contacts")}</h3></div><strong>3/8</strong></div><div className="patient-progress-track"><span style={{ width: "37.5%" }} /></div><div className="patient-milestones"><span className="done">8–12</span><span className="done">20</span><span className="done">26</span><span>30</span><span>34</span><span>36</span><span>38</span><span>40</span></div><p>{t("Ratiba hii inafuata mfano wa mawasiliano nane wa WHO; mhudumu wako anaweza kubadilisha ratiba kulingana na mahitaji yako.", "This follows the WHO eight-contact model; your care professional may adjust the schedule for your needs.")}</p></section>
        <section className="patient-danger-card"><div><span><CircleAlert aria-hidden="true" /></span><div><p className="patient-eyebrow">{t("Usisubiri", "Do not wait")}</p><h3>{t("Je, una dalili ya hatari?", "Do you have a danger sign?")}</h3><p>{t("Kutokwa damu, degedege, maumivu makali ya kichwa na kutoona vizuri, kupumua kwa shida, maumivu makali ya tumbo, au kupungua kwa harakati za mtoto kunahitaji huduma ya haraka.", "Bleeding, seizures, severe headache with blurred vision, difficulty breathing, severe abdominal pain, or reduced baby movement needs urgent assessment.")}</p></div></div><button type="button" onClick={() => setUrgentOpen(true)}>{t("Nahitaji msaada sasa", "I need help now")}<ArrowRight aria-hidden="true" /></button></section>
        {urgentOpen ? <div className="patient-sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setUrgentOpen(false); }}><section className="patient-sheet" role="alertdialog" aria-modal="true" aria-labelledby="urgent-title" tabIndex={-1} autoFocus onKeyDown={(event) => { if (event.key === "Escape") setUrgentOpen(false); }}><span><CircleAlert aria-hidden="true" /></span><h2 id="urgent-title">{t("Tafuta huduma ya haraka sasa", "Get urgent medical care now")}</h2><p>{t("Nenda hospitali au kituo cha afya kilicho karibu. Ikiwa unaweza, mwombe mtu unayemwamini akusindikize. MWANAMKE si huduma ya dharura.", "Go to the nearest hospital or health facility. If possible, ask someone you trust to accompany you. MWANAMKE is not an emergency service.")}</p><div><button type="button" className="patient-sheet-primary" onClick={onBrowseCare}>{t("Tafuta kituo cha huduma", "Find a care facility")}</button><button type="button" onClick={() => setUrgentOpen(false)}>{t("Funga", "Close")}</button></div></section></div> : null}
      </div>
    );
  }

  const activeCopy = stageCopy[stage];
  return (
    <div className="patient-space patient-enter">
      <header className="patient-page-head patient-home-head"><div><p className="patient-eyebrow">{t("Jumatatu, 14 Septemba", "Monday, 14 September")}</p><h1>{t("Habari, Amina", "Hello, Amina")}</h1><p>{t("Haya ndiyo muhimu kwako leo.", "Here’s what matters for you today.")}</p></div><span className="patient-private-badge"><ShieldCheck aria-hidden="true" />{t("Una udhibiti", "You’re in control")}</span></header>
      <div className="patient-stage-picker" role="tablist" aria-label={t("Chagua hatua ya afya", "Choose health stage")}>{stageLabels.map(([value, label]) => <button type="button" role="tab" key={value} aria-selected={stage === value} onClick={() => setStage(value)}>{label}</button>)}</div>
      <section className={`patient-stage-hero stage-${stage}`}>
        <div className="patient-stage-copy"><p>{activeCopy.label}</p><h2>{activeCopy.headline}</h2><span>{activeCopy.body}</span>{stage === "cycle" || stage === "pregnancy" ? <button type="button" onClick={() => onNavigate(stage === "pregnancy" ? "pregnancy" : "cycle")}>{stage === "pregnancy" ? t("Fungua ratiba ya ujauzito", "Open pregnancy timeline") : t("Fungua kalenda", "Open calendar")}<ArrowRight aria-hidden="true" /></button> : null}</div>
        <div className="patient-stage-visual" aria-hidden="true"><div className="patient-stage-ring"><span>{stage === "pregnancy" ? <Baby /> : stage === "postpartum" ? <HeartPulse /> : stage === "perimenopause" ? <TrendingUp /> : <Droplets />}</span></div><i /><i /></div>
        <div className="patient-stage-metric"><small>{activeCopy.metric}</small><strong>{activeCopy.detail}</strong></div>
      </section>
      <div className="patient-home-grid">
        {quickLog}
        <div className="patient-home-side">
          <section className="patient-card patient-insight-card"><div className="patient-insight-icon"><TrendingUp aria-hidden="true" /></div><p className="patient-eyebrow">{t("Mwenendo wako", "Your pattern")}</p><h3>{t("Nguvu huwa juu baada ya hedhi", "Energy tends to rise after your period")}</h3><p>{t("Umeweka kumbukumbu hii katika mizunguko 3 iliyopita. Endelea kurekodi ili kuona kama inaendelea.", "This appeared across your last 3 cycles. Keep logging to see whether the pattern continues.")}</p><button type="button" onClick={() => onNavigate("cycle")}>{t("Angalia mienendo", "Explore patterns")}<ChevronRight aria-hidden="true" /></button></section>
          <section className="patient-card patient-care-card"><span><CalendarDays aria-hidden="true" /></span><div><p className="patient-eyebrow">{t("Miadi inayofuata", "Next appointment")}</p><h3>{t("Jumatano · 3:30 asubuhi", "Wednesday · 9:30 AM")}</h3><p>{t("Kliniki ya Wanawake Bahari", "Bahari Women’s Clinic")}</p></div><button type="button" aria-label={t("Fungua miadi", "Open appointments")} onClick={onOpenAppointments}><ChevronRight aria-hidden="true" /></button></section>
          <section className="patient-privacy-strip"><LockKeyhole aria-hidden="true" /><div><strong>{t("Kumbukumbu zako ni binafsi", "Your entries are private")}</strong><p>{t("Hakuna mhudumu anayeweza kuziona bila ruhusa yako ya wazi.", "No care professional can see them without your explicit consent.")}</p></div></section>
        </div>
      </div>
    </div>
  );
}
