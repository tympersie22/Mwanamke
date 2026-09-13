// Deployment gate: validates that production has every external security boundary.
// It never prints secret values and does not contact providers.
const required = [
  "APP_ORIGIN", "DATABASE_URL", "OIDC_PATIENT_ISSUER_URL", "OIDC_PATIENT_AUDIENCE", "OIDC_PATIENT_JWKS_URL",
  "OIDC_WORKFORCE_ISSUER_URL", "OIDC_WORKFORCE_AUDIENCE", "OIDC_WORKFORCE_JWKS_URL", "IDENTITY_SUBJECT_HMAC_KEY",
  "AUDIT_HMAC_KEY", "AUDIT_SINK_URL", "AUDIT_SINK_TOKEN", "REDIS_URL"
];
const missing = required.filter((name) => !process.env[name]);
if (process.env.NODE_ENV !== "production") throw new Error("NODE_ENV must be production");
if (missing.length) throw new Error(`Missing production controls: ${missing.join(", ")}`);
for (const name of ["APP_ORIGIN", "OIDC_PATIENT_ISSUER_URL", "OIDC_PATIENT_JWKS_URL", "OIDC_WORKFORCE_ISSUER_URL", "OIDC_WORKFORCE_JWKS_URL", "AUDIT_SINK_URL"]) {
  if (!process.env[name].startsWith("https://")) throw new Error(`${name} must use HTTPS`);
}
if (!process.env.REDIS_URL.startsWith("rediss://")) throw new Error("REDIS_URL must use TLS (rediss://)");
if (!/^postgres(?:ql):\/\//.test(process.env.DATABASE_URL)) throw new Error("DATABASE_URL must use PostgreSQL");
for (const name of ["IDENTITY_SUBJECT_HMAC_KEY", "AUDIT_HMAC_KEY"]) {
  const bytes = Buffer.from(process.env[name], "base64");
  if (bytes.length < 32) throw new Error(`${name} must decode to at least 256 bits`);
}
if (process.env.IDENTITY_SUBJECT_HMAC_KEY === process.env.AUDIT_HMAC_KEY) throw new Error("Identity and audit keys must be different secrets");

if (process.env.ENABLE_ENCRYPTED_RECORDS && !["true", "false"].includes(process.env.ENABLE_ENCRYPTED_RECORDS)) {
  throw new Error("ENABLE_ENCRYPTED_RECORDS must be true or false");
}
if (process.env.ENABLE_ENCRYPTED_RECORDS === "true") {
  for (const name of ["INFRASTRUCTURE_APPROVAL_REF", "SECURITY_ASSESSMENT_APPROVAL_REF", "PRIVACY_LEGAL_APPROVAL_REF"]) {
    if (!process.env[name] || process.env[name].length < 8) throw new Error(`${name} is required before encrypted records can be enabled`);
  }
}
console.log("PASS: production identity, audit, Redis, PostgreSQL and HTTPS boundaries are configured");
