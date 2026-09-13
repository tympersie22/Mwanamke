import { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Production data must be provisioned through reviewed operational workflows; seed is local-only.");
  await prisma.countryConfiguration.upsert({
    where: { countryCode_jurisdictionCode: { countryCode: "TZ", jurisdictionCode: "ZANZIBAR" } },
    update: {},
    create: {
      countryCode: "TZ",
      jurisdictionCode: "ZANZIBAR",
      currency: "TZS",
      emergencyNumbers: {},
      enabledPaymentAdapters: ["mock-mpesa", "mock-mixx", "mock-airtel", "mock-halopesa", "mock-card", "mock-sponsor"],
      enabledChannels: ["app"],
      active: false
    }
  });
  await prisma.countryConfiguration.upsert({
    where: { countryCode_jurisdictionCode: { countryCode: "TZ", jurisdictionCode: "MAINLAND" } },
    update: {},
    create: {
      countryCode: "TZ",
      jurisdictionCode: "MAINLAND",
      currency: "TZS",
      emergencyNumbers: {},
      enabledPaymentAdapters: ["mock-mpesa", "mock-mixx", "mock-airtel", "mock-halopesa", "mock-card", "mock-sponsor"],
      enabledChannels: ["app"],
      active: false
    }
  });

  if (process.env.ALLOW_DEMO_DATA === "true" && process.env.NODE_ENV !== "production") {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(6, 0, 0, 0);
    const laterTomorrow = new Date(tomorrow.getTime() + 3_600_000);
    const ids = {
      providerUser: "10000000-0000-4000-8000-000000000002",
      navigatorUser: "10000000-0000-4000-8000-000000000003",
      adminUser: "10000000-0000-4000-8000-000000000004",
      provider: "20000000-0000-4000-8000-000000000001",
      verification: "20000000-0000-4000-8000-000000000002",
      facility: "20000000-0000-4000-8000-000000000003",
      service: "20000000-0000-4000-8000-000000000004"
    };
    const identityKey = Buffer.from(process.env.IDENTITY_SUBJECT_HMAC_KEY ?? "", "base64");
    if (identityKey.length < 32) throw new Error("Local role previews require IDENTITY_SUBJECT_HMAC_KEY.");
    const issuer = process.env.LOCAL_DEMO_OIDC_ISSUER ?? "development";
    const previewUsers = [
      { id: ids.providerUser, publicHandle: "local-provider-preview", role: "PROVIDER" as const, subject: "synthetic-provider-validation" },
      { id: ids.navigatorUser, publicHandle: "local-navigator-preview", role: "NAVIGATOR" as const, subject: "synthetic-navigator-validation" },
      { id: ids.adminUser, publicHandle: "local-admin-preview", role: "PLATFORM_ADMIN" as const, subject: "synthetic-platform-admin-validation" }
    ];
    for (const preview of previewUsers) {
      await prisma.user.upsert({ where: { id: preview.id }, update: { role: preview.role, status: "ACTIVE" }, create: { id: preview.id, publicHandle: preview.publicHandle, role: preview.role } });
      const digest = createHmac("sha256", identityKey).update(issuer).update("\u0000").update(preview.subject).digest();
      await prisma.externalIdentity.upsert({ where: { issuerSubjectDigest: digest }, update: { userId: preview.id }, create: { userId: preview.id, issuerSubjectDigest: digest } });
    }
    await prisma.facility.upsert({
      where: { id: ids.facility },
      update: { nameEn: "Mwanamke Demo Clinic", nameSw: "Kliniki ya Mfano ya Mwanamke", locality: "Zanzibar Urban", verified: true },
      create: { id: ids.facility, countryCode: "TZ", regionCode: "ZANZIBAR", nameEn: "Mwanamke Demo Clinic", nameSw: "Kliniki ya Mfano ya Mwanamke", locality: "Zanzibar Urban", verified: true }
    });
    await prisma.provider.upsert({
      where: { id: ids.provider },
      update: { userId: ids.providerUser, displayName: "Dr Amina Mushi", titleEn: "Women's health clinician (fictional demo profile)", titleSw: "Mtoa huduma ya afya ya wanawake (wasifu wa mfano)", specializations: ["women-health"], languages: ["sw", "en"], active: true },
      create: { id: ids.provider, userId: ids.providerUser, displayName: "Dr Amina Mushi", titleEn: "Women's health clinician (fictional demo profile)", titleSw: "Mtoa huduma ya afya ya wanawake (wasifu wa mfano)", specializations: ["women-health"], languages: ["sw", "en"], gender: "female", active: true }
    });
    await prisma.providerVerification.upsert({
      where: { id: ids.verification },
      update: { status: "VERIFIED", reviewedAt: new Date() },
      create: { id: ids.verification, providerId: ids.provider, status: "VERIFIED", authorityCode: "LOCAL-ONLY", credentialDigest: Buffer.from("fictional-local-credential"), reviewedAt: new Date() }
    });
    await prisma.service.upsert({
      where: { id: ids.service },
      update: { nameEn: "Private virtual consultation", nameSw: "Ushauri wa faragha mtandaoni", active: true },
      create: { id: ids.service, facilityId: ids.facility, code: "LOCAL-CONSULT", nameEn: "Private virtual consultation", nameSw: "Ushauri wa faragha mtandaoni", mode: "virtual", priceTzs: 15000, active: true }
    });
    await prisma.providerService.upsert({ where: { providerId_serviceId: { providerId: ids.provider, serviceId: ids.service } }, update: {}, create: { providerId: ids.provider, serviceId: ids.service } });
    await prisma.availabilitySlot.deleteMany({ where: { providerId: ids.provider, reservedAt: null, appointments: { none: {} } } });
    await prisma.availabilitySlot.createMany({ data: [
      { providerId: ids.provider, startsAt: tomorrow, endsAt: new Date(tomorrow.getTime() + 1_800_000), mode: "virtual" },
      { providerId: ids.provider, startsAt: laterTomorrow, endsAt: new Date(laterTomorrow.getTime() + 1_800_000), mode: "virtual" }
    ], skipDuplicates: true });
    console.info("Seeded fictional local container fixtures. These records are blocked in production.");
  } else {
    console.info("Seeded jurisdiction configuration only; no people, providers, facilities, services or slots were created.");
  }
}

main().finally(async () => prisma.$disconnect());
