import { describe, expect, it } from "vitest";
import { cycleSummary, pregnancySummary, postpartumSummary, validProfile, type PatientHealthProfile } from "./patient-health";

const base: PatientHealthProfile = { lifeStage: "cycle", updatedAt: "2026-09-25T00:00:00.000Z" };

describe("patient health estimates", () => {
  it("derives a cycle only from patient-entered dates", () => {
    expect(cycleSummary({ ...base, lastPeriodStart: "2026-09-01", typicalCycleLength: 29 }, "2026-09-13")).toEqual({
      cycleDay: 13,
      estimatedNextPeriod: "2026-09-30",
      estimatedOvulation: "2026-09-16",
      stale: false
    });
    expect(cycleSummary(base, "2026-09-13")).toBeNull();
  });

  it("derives pregnancy progress from the entered estimated due date", () => {
    expect(pregnancySummary({ ...base, lifeStage: "pregnancy", estimatedDueDate: "2026-12-29" }, "2026-09-12")).toEqual({
      weeks: 24,
      days: 4,
      trimester: 2,
      remainingDays: 108,
      progress: 61
    });
  });

  it("rejects impossible or unsafe profile values", () => {
    expect(validProfile({ ...base, typicalCycleLength: 46 })).toBe(false);
    expect(validProfile({ ...base, lastPeriodStart: "2026-02-30" })).toBe(false);
    expect(postpartumSummary({ ...base, lifeStage: "postpartum", deliveryDate: "2026-08-15" }, "2026-09-19")).toEqual({ weeks: 5, days: 0 });
  });
});
