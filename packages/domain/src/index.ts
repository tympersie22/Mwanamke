export type LocalizedText = { en: string; sw: string };
export type Language = "sw" | "en";
export type Region = "Zanzibar" | "Mainland";

export type Provider = {
  id: string;
  name: string;
  title: LocalizedText;
  specialty: LocalizedText;
  facility: LocalizedText;
  location: LocalizedText;
  region: Region;
  languages: string[];
  gender: "female" | "male";
  verified: boolean;
  verificationNote: LocalizedText;
  modes: Array<"physical" | "virtual">;
  priceTzs: number;
  distanceKm: number;
  rating: number;
  nextSlot: string;
  accessibility: LocalizedText;
  initials: string;
  tone: "teal" | "coral" | "lavender";
};

export type Appointment = {
  id: string;
  providerId: string;
  date: string;
  time: string;
  mode: "physical" | "virtual";
  status: "confirmed" | "completed" | "cancelled";
  paymentStatus: "reserved" | "paid" | "sponsored";
};

export type Product = {
  id: string;
  name: LocalizedText;
  category: LocalizedText;
  priceTzs: number;
  unit: LocalizedText;
  badge?: LocalizedText;
  icon: "drop" | "heart" | "shield" | "bag";
};

export const providers: Provider[] = [
  {
    id: "demo-provider-asha",
    name: "Dkt. Asha Khamis",
    title: { en: "Obstetrician & gynaecologist", sw: "Daktari wa uzazi na afya ya wanawake" },
    specialty: { en: "Pregnancy & reproductive care", sw: "Ujauzito na afya ya uzazi" },
    facility: { en: "Bahari Women’s Clinic · Demo", sw: "Kliniki ya Wanawake Bahari · Mfano" },
    location: { en: "Mkunazini, Zanzibar City", sw: "Mkunazini, Zanzibar Mjini" },
    region: "Zanzibar",
    languages: ["Kiswahili", "English"],
    gender: "female",
    verified: true,
    verificationNote: { en: "Identity, licence and facility affiliation checked for this demo profile.", sw: "Utambulisho, leseni na kituo vimehakikiwa kwa wasifu huu wa mfano." },
    modes: ["physical", "virtual"],
    priceTzs: 35000,
    distanceKm: 2.4,
    rating: 4.9,
    nextSlot: "09:30",
    accessibility: { en: "Step-free entrance · private waiting area", sw: "Njia isiyo na ngazi · eneo binafsi la kusubiri" },
    initials: "AK",
    tone: "teal"
  },
  {
    id: "demo-provider-neema",
    name: "Muuguzi Neema Salum",
    title: { en: "Registered nurse-midwife", sw: "Muuguzi na mkunga aliyesajiliwa" },
    specialty: { en: "Antenatal & postpartum care", sw: "Huduma za ujauzito na baada ya kujifungua" },
    facility: { en: "Mwangaza Health Centre · Demo", sw: "Kituo cha Afya Mwangaza · Mfano" },
    location: { en: "Chake Chake, Pemba", sw: "Chake Chake, Pemba" },
    region: "Zanzibar",
    languages: ["Kiswahili"],
    gender: "female",
    verified: true,
    verificationNote: { en: "Identity and professional registration checked for this demo profile.", sw: "Utambulisho na usajili wa kitaaluma vimehakikiwa kwa wasifu huu wa mfano." },
    modes: ["physical"],
    priceTzs: 18000,
    distanceKm: 5.8,
    rating: 4.8,
    nextSlot: "11:00",
    accessibility: { en: "Ground-floor consultation room", sw: "Chumba cha huduma kiko ghorofa ya chini" },
    initials: "NS",
    tone: "coral"
  },
  {
    id: "demo-provider-rehema",
    name: "Dkt. Rehema Mushi",
    title: { en: "Family physician", sw: "Daktari wa familia" },
    specialty: { en: "General women’s health", sw: "Afya ya jumla ya wanawake" },
    facility: { en: "Salama Family Practice · Demo", sw: "Kliniki ya Familia Salama · Mfano" },
    location: { en: "Mikocheni, Dar es Salaam", sw: "Mikocheni, Dar es Salaam" },
    region: "Mainland",
    languages: ["Kiswahili", "English"],
    gender: "female",
    verified: true,
    verificationNote: { en: "Identity, licence and facility affiliation checked for this demo profile.", sw: "Utambulisho, leseni na kituo vimehakikiwa kwa wasifu huu wa mfano." },
    modes: ["physical", "virtual"],
    priceTzs: 30000,
    distanceKm: 8.1,
    rating: 4.7,
    nextSlot: "14:30",
    accessibility: { en: "Lift access · accessible washroom", sw: "Lifti · choo kinachofikika" },
    initials: "RM",
    tone: "lavender"
  }
];

export const demoAppointment: Appointment = {
  id: "apt-demo-001",
  providerId: "demo-provider-asha",
  date: "8 Sep 2026",
  time: "09:30",
  mode: "physical",
  status: "confirmed",
  paymentStatus: "reserved"
};

export const products: Product[] = [
  { id: "prod-pads", name: { en: "Comfort cotton pads", sw: "Pedi laini za pamba" }, category: { en: "Menstrual care", sw: "Huduma ya hedhi" }, priceTzs: 4800, unit: { en: "pack of 10", sw: "pakiti ya 10" }, badge: { en: "Low stock", sw: "Zimebaki chache" }, icon: "drop" },
  { id: "prod-prenatal", name: { en: "Prenatal essentials kit", sw: "Kifurushi cha mahitaji ya ujauzito" }, category: { en: "Maternity", sw: "Uzazi" }, priceTzs: 32000, unit: { en: "one kit", sw: "kifurushi kimoja" }, icon: "heart" },
  { id: "prod-postpartum", name: { en: "Postpartum comfort set", sw: "Seti ya faraja baada ya kujifungua" }, category: { en: "Postpartum", sw: "Baada ya kujifungua" }, priceTzs: 27500, unit: { en: "one set", sw: "seti moja" }, icon: "bag" }
];

export const careCases = [
  { id: "CASE-1048", member: "Amina J.", need: { en: "Clinic selection", sw: "Kuchagua kliniki" }, channel: "secure", status: "active", wait: "3 min" },
  { id: "CASE-1046", member: "Saada M.", need: { en: "Lab coordination", sw: "Uratibu wa maabara" }, channel: "secure", status: "followUp", wait: "18 min" },
  { id: "CASE-1042", member: "Private member", need: { en: "Cost guidance", sw: "Maelezo ya gharama" }, channel: "secure", status: "new", wait: "24 min" }
] as const;

export const clinicalContent = [
  { id: "CC-014", title: { en: "Pregnancy danger signs", sw: "Dalili hatari za ujauzito" }, version: "2.1", reviewer: "Clinical review board · Demo", status: "approved", reviewed: "28 Aug 2026" },
  { id: "CC-021", title: { en: "Mental wellbeing check-in", sw: "Tathmini ya afya ya akili" }, version: "1.4", reviewer: "Safeguarding lead · Demo", status: "approved", reviewed: "22 Aug 2026" }
] as const;

export const auditEvents = [
  { id: "AUD-8801", action: "provider.verification.viewed", actor: "admin-demo@mwanamke.test", scope: "operational", at: "05 Sep · 10:42" },
  { id: "AUD-8798", action: "consent.revoked", actor: "member-device", scope: "ciphertext reference only", at: "05 Sep · 09:18" },
  { id: "AUD-8790", action: "appointment.status.updated", actor: "facility-demo", scope: "operational", at: "04 Sep · 16:07" }
] as const;
