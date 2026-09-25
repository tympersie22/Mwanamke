export type LifeStage = "cycle" | "pregnancy" | "postpartum" | "perimenopause";

export type PatientHealthProfile = {
  lifeStage: LifeStage;
  lastPeriodStart?: string;
  typicalCycleLength?: number;
  typicalPeriodLength?: number;
  estimatedDueDate?: string;
  deliveryDate?: string;
  updatedAt: string;
};

export type DailyCheckIn = {
  date: string;
  flow: "none" | "light" | "medium" | "heavy";
  mood: "low" | "steady" | "good" | "great";
  symptoms: string[];
  updatedAt: string;
};

export type PatientHealthVault = {
  version: 1;
  profile?: PatientHealthProfile;
  checkIns: DailyCheckIn[];
};

const DAY_MS = 86_400_000;

function utcDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day ? date : null;
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateValue: string, amount: number) {
  const date = utcDate(dateValue);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function cycleSummary(profile: PatientHealthProfile | undefined, todayValue = localDateKey()) {
  if (!profile?.lastPeriodStart || !profile.typicalCycleLength) return null;
  const start = utcDate(profile.lastPeriodStart);
  const today = utcDate(todayValue);
  if (!start || !today) return null;
  const elapsed = daysBetween(start, today);
  if (elapsed < 0) return null;
  const estimatedNextPeriod = addDays(profile.lastPeriodStart, profile.typicalCycleLength);
  const stale = elapsed > profile.typicalCycleLength + 14;
  return {
    cycleDay: elapsed + 1,
    estimatedNextPeriod,
    stale,
    estimatedOvulation: addDays(profile.lastPeriodStart, profile.typicalCycleLength - 14)
  };
}

export function pregnancySummary(profile: PatientHealthProfile | undefined, todayValue = localDateKey()) {
  if (!profile?.estimatedDueDate) return null;
  const due = utcDate(profile.estimatedDueDate);
  const today = utcDate(todayValue);
  if (!due || !today) return null;
  const remainingDays = daysBetween(today, due);
  const gestationalDays = 280 - remainingDays;
  if (gestationalDays < 0 || gestationalDays > 294) return null;
  const weeks = Math.floor(gestationalDays / 7);
  const days = gestationalDays % 7;
  const trimester = weeks < 14 ? 1 : weeks < 28 ? 2 : 3;
  return { weeks, days, trimester, remainingDays, progress: Math.min(100, Math.max(0, Math.round((gestationalDays / 280) * 100))) };
}

export function postpartumSummary(profile: PatientHealthProfile | undefined, todayValue = localDateKey()) {
  if (!profile?.deliveryDate) return null;
  const delivery = utcDate(profile.deliveryDate);
  const today = utcDate(todayValue);
  if (!delivery || !today) return null;
  const elapsedDays = daysBetween(delivery, today);
  if (elapsedDays < 0) return null;
  return { weeks: Math.floor(elapsedDays / 7), days: elapsedDays % 7 };
}

export function validProfile(profile: PatientHealthProfile) {
  if (!(["cycle", "pregnancy", "postpartum", "perimenopause"] as string[]).includes(profile.lifeStage)) return false;
  if (profile.typicalCycleLength !== undefined && (!Number.isInteger(profile.typicalCycleLength) || profile.typicalCycleLength < 21 || profile.typicalCycleLength > 45)) return false;
  if (profile.typicalPeriodLength !== undefined && (!Number.isInteger(profile.typicalPeriodLength) || profile.typicalPeriodLength < 1 || profile.typicalPeriodLength > 10)) return false;
  if (profile.lastPeriodStart && !utcDate(profile.lastPeriodStart)) return false;
  if (profile.estimatedDueDate && !utcDate(profile.estimatedDueDate)) return false;
  if (profile.deliveryDate && !utcDate(profile.deliveryDate)) return false;
  return Boolean(profile.updatedAt);
}
