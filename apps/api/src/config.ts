import { z } from "zod";

const booleanValue = z.enum(["true", "false"]).optional().transform((value) => value === "true");

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional(),
  STATE_STORE: z.enum(["memory", "postgres"]).default("memory"),
  AUTH_MODE: z.enum(["development", "oidc"]).default("development"),
  ALLOW_DEMO_AUTH: booleanValue,
  ALLOW_DEMO_DATA: booleanValue,
  ENABLE_ENCRYPTED_RECORDS: booleanValue,
  INFRASTRUCTURE_APPROVAL_REF: z.string().min(8).max(200).optional(),
  SECURITY_ASSESSMENT_APPROVAL_REF: z.string().min(8).max(200).optional(),
  PRIVACY_LEGAL_APPROVAL_REF: z.string().min(8).max(200).optional(),
  OIDC_ISSUER_URL: z.string().url().optional(),
  OIDC_AUDIENCE: z.string().min(3).optional(),
  OIDC_JWKS_URL: z.string().url().optional(),
  OIDC_ROLES_CLAIM: z.string().min(1).default("roles"),
  OIDC_AUTH_METHODS_CLAIM: z.string().min(1).default("amr"),
  OIDC_PATIENT_ISSUER_URL: z.string().url().optional(),
  OIDC_PATIENT_AUDIENCE: z.string().min(3).optional(),
  OIDC_PATIENT_JWKS_URL: z.string().url().optional(),
  OIDC_WORKFORCE_ISSUER_URL: z.string().url().optional(),
  OIDC_WORKFORCE_AUDIENCE: z.string().min(3).optional(),
  OIDC_WORKFORCE_JWKS_URL: z.string().url().optional(),
  IDENTITY_SUBJECT_HMAC_KEY: z.string().optional(),
  AUDIT_HMAC_KEY: z.string().optional(),
  AUDIT_SINK_URL: z.string().url().optional(),
  AUDIT_SINK_TOKEN: z.string().min(32).optional(),
  REDIS_URL: z.string().url().optional(),
  PAYMENT_ADAPTER: z.enum(["mock", "configured"]).default("mock"),
  NOTIFICATION_ADAPTER: z.enum(["mock", "configured"]).default("mock"),
  TELECONSULT_ADAPTER: z.enum(["disabled", "configured"]).default("disabled"),
  BLOODMATCH_ADAPTER: z.enum(["disabled", "configured"]).default("disabled"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  TRUST_PROXY: booleanValue,
  OUTBOX_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(25).default(8),
  WORKER_ID: z.string().min(3).max(100).default("worker-local")
}).superRefine((environment, context) => {
  if (environment.NODE_ENV !== "production") return;

  const productionRequirements: Array<[boolean, string, string]> = [
    [environment.APP_ORIGIN.startsWith("https://"), "APP_ORIGIN", "Production origins must use HTTPS."],
    [Boolean(environment.DATABASE_URL), "DATABASE_URL", "A production PostgreSQL connection is required."],
    [environment.STATE_STORE === "postgres", "STATE_STORE", "In-memory state is forbidden in production."],
    [environment.AUTH_MODE === "oidc", "AUTH_MODE", "Production authentication must use OIDC."],
    [Boolean(environment.OIDC_PATIENT_ISSUER_URL?.startsWith("https://")), "OIDC_PATIENT_ISSUER_URL", "A HTTPS patient OIDC issuer is required."],
    [Boolean(environment.OIDC_PATIENT_JWKS_URL?.startsWith("https://")), "OIDC_PATIENT_JWKS_URL", "A HTTPS patient JWKS endpoint is required."],
    [Boolean(environment.OIDC_PATIENT_AUDIENCE), "OIDC_PATIENT_AUDIENCE", "An explicit patient OIDC audience is required."],
    [Boolean(environment.OIDC_WORKFORCE_ISSUER_URL?.startsWith("https://")), "OIDC_WORKFORCE_ISSUER_URL", "A HTTPS workforce OIDC issuer is required."],
    [Boolean(environment.OIDC_WORKFORCE_JWKS_URL?.startsWith("https://")), "OIDC_WORKFORCE_JWKS_URL", "A HTTPS workforce JWKS endpoint is required."],
    [Boolean(environment.OIDC_WORKFORCE_AUDIENCE), "OIDC_WORKFORCE_AUDIENCE", "An explicit workforce OIDC audience is required."],
    [Boolean(environment.IDENTITY_SUBJECT_HMAC_KEY && environment.IDENTITY_SUBJECT_HMAC_KEY.length >= 43), "IDENTITY_SUBJECT_HMAC_KEY", "A base64-encoded 256-bit identity mapping key is required."],
    [Boolean(environment.AUDIT_HMAC_KEY && environment.AUDIT_HMAC_KEY.length >= 43), "AUDIT_HMAC_KEY", "A separate base64-encoded 256-bit audit key is required."],
    [Boolean(environment.AUDIT_SINK_URL?.startsWith("https://")), "AUDIT_SINK_URL", "A HTTPS append-only audit sink is required."],
    [Boolean(environment.AUDIT_SINK_TOKEN), "AUDIT_SINK_TOKEN", "An audit sink credential is required."],
    [Boolean(environment.REDIS_URL?.startsWith("rediss://")), "REDIS_URL", "A TLS Redis rate-limit store is required."],
    [environment.PAYMENT_ADAPTER === "configured", "PAYMENT_ADAPTER", "Mock payments are forbidden in production."],
    [environment.NOTIFICATION_ADAPTER === "configured", "NOTIFICATION_ADAPTER", "Mock notifications are forbidden in production."],
    [!environment.ALLOW_DEMO_AUTH, "ALLOW_DEMO_AUTH", "Demo authentication is forbidden in production."],
    [!environment.ALLOW_DEMO_DATA, "ALLOW_DEMO_DATA", "Demo data is forbidden in production."]
  ];

  for (const [valid, path, message] of productionRequirements) {
    if (!valid) context.addIssue({ code: "custom", path: [path], message });
  }

  if (environment.ENABLE_ENCRYPTED_RECORDS) {
    const approvalRequirements: Array<[string | undefined, string, string]> = [
      [environment.INFRASTRUCTURE_APPROVAL_REF, "INFRASTRUCTURE_APPROVAL_REF", "Encrypted records require an approved infrastructure and restore-drill reference."],
      [environment.SECURITY_ASSESSMENT_APPROVAL_REF, "SECURITY_ASSESSMENT_APPROVAL_REF", "Encrypted records require an independent security-assessment approval reference."],
      [environment.PRIVACY_LEGAL_APPROVAL_REF, "PRIVACY_LEGAL_APPROVAL_REF", "Encrypted records require a signed privacy and Tanzania/Zanzibar legal approval reference."]
    ];
    for (const [value, path, message] of approvalRequirements) {
      if (!value) context.addIssue({ code: "custom", path: [path], message });
    }
  }

  if (environment.DATABASE_URL && !/^postgres(ql)?:\/\//.test(environment.DATABASE_URL)) {
    context.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "DATABASE_URL must use PostgreSQL." });
  }
});

export type RuntimeConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  appOrigin: string;
  databaseUrl: string | undefined;
  stateStore: "memory" | "postgres";
  authMode: "development" | "oidc";
  allowDemoAuth: boolean;
  allowDemoData: boolean;
  features: {
    encryptedRecords: boolean;
    infrastructureApprovalRef: string | undefined;
    securityAssessmentApprovalRef: string | undefined;
    privacyLegalApprovalRef: string | undefined;
  };
  oidc: { issuer: string; audience: string; jwksUrl: string; rolesClaim: string; authMethodsClaim: string } | undefined;
  oidcRealms: {
    patient: { issuer: string; audience: string; jwksUrl: string; rolesClaim: string; authMethodsClaim: string };
    workforce: { issuer: string; audience: string; jwksUrl: string; rolesClaim: string; authMethodsClaim: string };
  } | undefined;
  identitySubjectHmacKey: string | undefined;
  auditHmacKey: string | undefined;
  auditSinkUrl: string | undefined;
  auditSinkToken: string | undefined;
  redisUrl: string | undefined;
  adapters: { payment: "mock" | "configured"; notification: "mock" | "configured"; teleconsult: "disabled" | "configured"; bloodmatch: "disabled" | "configured" };
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  trustProxy: boolean;
  outbox: { pollMs: number; maxAttempts: number; workerId: string };
};

export function loadRuntimeConfig(source: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid MWANAMKE runtime configuration: ${details}`);
  }

  const environment = parsed.data;
  return {
    nodeEnv: environment.NODE_ENV,
    host: environment.HOST,
    port: environment.PORT,
    appOrigin: environment.APP_ORIGIN,
    databaseUrl: environment.DATABASE_URL,
    stateStore: environment.STATE_STORE,
    authMode: environment.AUTH_MODE,
    allowDemoAuth: environment.ALLOW_DEMO_AUTH,
    allowDemoData: environment.ALLOW_DEMO_DATA,
    features: {
      encryptedRecords: environment.ENABLE_ENCRYPTED_RECORDS,
      infrastructureApprovalRef: environment.INFRASTRUCTURE_APPROVAL_REF,
      securityAssessmentApprovalRef: environment.SECURITY_ASSESSMENT_APPROVAL_REF,
      privacyLegalApprovalRef: environment.PRIVACY_LEGAL_APPROVAL_REF
    },
    oidc: environment.AUTH_MODE === "oidc" && environment.OIDC_ISSUER_URL && environment.OIDC_AUDIENCE && environment.OIDC_JWKS_URL ? {
      issuer: environment.OIDC_ISSUER_URL!,
      audience: environment.OIDC_AUDIENCE!,
      jwksUrl: environment.OIDC_JWKS_URL!,
      rolesClaim: environment.OIDC_ROLES_CLAIM,
      authMethodsClaim: environment.OIDC_AUTH_METHODS_CLAIM
    } : undefined,
    oidcRealms: environment.AUTH_MODE === "oidc" && environment.OIDC_PATIENT_ISSUER_URL && environment.OIDC_PATIENT_AUDIENCE && environment.OIDC_PATIENT_JWKS_URL && environment.OIDC_WORKFORCE_ISSUER_URL && environment.OIDC_WORKFORCE_AUDIENCE && environment.OIDC_WORKFORCE_JWKS_URL ? {
      patient: { issuer: environment.OIDC_PATIENT_ISSUER_URL, audience: environment.OIDC_PATIENT_AUDIENCE, jwksUrl: environment.OIDC_PATIENT_JWKS_URL, rolesClaim: environment.OIDC_ROLES_CLAIM, authMethodsClaim: environment.OIDC_AUTH_METHODS_CLAIM },
      workforce: { issuer: environment.OIDC_WORKFORCE_ISSUER_URL, audience: environment.OIDC_WORKFORCE_AUDIENCE, jwksUrl: environment.OIDC_WORKFORCE_JWKS_URL, rolesClaim: environment.OIDC_ROLES_CLAIM, authMethodsClaim: environment.OIDC_AUTH_METHODS_CLAIM }
    } : undefined,
    identitySubjectHmacKey: environment.IDENTITY_SUBJECT_HMAC_KEY,
    auditHmacKey: environment.AUDIT_HMAC_KEY,
    auditSinkUrl: environment.AUDIT_SINK_URL,
    auditSinkToken: environment.AUDIT_SINK_TOKEN,
    redisUrl: environment.REDIS_URL,
    adapters: {
      payment: environment.PAYMENT_ADAPTER,
      notification: environment.NOTIFICATION_ADAPTER,
      teleconsult: environment.TELECONSULT_ADAPTER,
      bloodmatch: environment.BLOODMATCH_ADAPTER
    },
    logLevel: environment.LOG_LEVEL,
    trustProxy: environment.TRUST_PROXY,
    outbox: { pollMs: environment.OUTBOX_POLL_MS, maxAttempts: environment.OUTBOX_MAX_ATTEMPTS, workerId: environment.WORKER_ID }
  };
}
