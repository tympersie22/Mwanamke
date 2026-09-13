import { z } from "zod";

export const pageQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().uuid().optional() }).strict();
export type PageQuery = z.infer<typeof pageQuery>;
export type Page<T> = { data: T[]; nextCursor: string | null };
export const providerDto = z.object({ id: z.string().uuid(), displayName: z.string(), titleEn: z.string(), titleSw: z.string(), specializations: z.array(z.string()), languages: z.array(z.string()), gender: z.string(), verified: z.literal(true) });
export const slotDto = z.object({ id: z.string().uuid(), providerId: z.string().uuid(), startsAt: z.string().datetime(), endsAt: z.string().datetime(), mode: z.enum(["physical", "virtual"]) });
export const appointmentDto = z.object({ id: z.string().uuid(), holdExpiresAt: z.string().datetime().nullable(), amountTzs: z.number().int().nonnegative(), timeZone: z.string(), status: z.enum(["expired", "requested", "confirmed", "completed", "cancelled", "no_show"]), providerId: z.string(), facilityId: z.string().nullable(), serviceId: z.string().uuid(), slotId: z.string().uuid(), startsAt: z.string().datetime(), mode: z.enum(["physical", "virtual"]) });
export const paymentDto = z.object({ id: z.string().uuid(), appointmentId: z.string().uuid().nullable(), amountTzs: z.number().int().nonnegative(), currency: z.literal("TZS"), status: z.enum(["queued", "reserved", "paid", "failed", "refunded", "sponsored"]), createdAt: z.string().datetime() });
export const assignmentDto = z.object({ id: z.string().uuid(), status: z.string(), assignedAt: z.string().datetime() });
export type ProviderDto = z.infer<typeof providerDto>;
export type SlotDto = z.infer<typeof slotDto>;
export type AppointmentDto = z.infer<typeof appointmentDto>;
export type PaymentDto = z.infer<typeof paymentDto>;
export type AssignmentDto = z.infer<typeof assignmentDto>;
export function page<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const data = rows.slice(0, limit);
  return { data, nextCursor: rows.length > limit ? data[data.length - 1]!.id : null };
}
export function validatedPage<T extends z.ZodType>(schema: T, value: unknown) {
  return z.object({ data: z.array(schema), nextCursor: z.string().uuid().nullable() }).parse(value);
}

export const serviceDto = z.object({ id: z.string().uuid(), nameEn: z.string(), nameSw: z.string(), mode: z.enum(["physical", "virtual"]), priceTzs: z.number().int().nonnegative(), facility: z.object({ id: z.string().uuid(), nameEn: z.string(), nameSw: z.string(), locality: z.string(), accessibilityEn: z.string().nullable(), accessibilitySw: z.string().nullable() }) });
export type ServiceDto = z.infer<typeof serviceDto>;

export const profileDto = z.object({ preferredLanguage: z.enum(["sw", "en"]) }).strict();
export const privacyRequestDto = z.object({ id: z.string().uuid(), kind: z.enum(["export", "deletion"]), status: z.enum(["submitted", "in_review", "completed", "rejected"]), createdAt: z.string().datetime() });
export type ProfileDto = z.infer<typeof profileDto>;
export type PrivacyRequestDto = z.infer<typeof privacyRequestDto>;
