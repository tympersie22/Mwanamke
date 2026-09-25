// Usage: terraform -chdir=infra/aws/platform output -json github_environment_variables |
// node scripts/production/configure-staging-github.mjs [--apply]
// Only allowlisted public configuration is accepted; secrets must use Secrets Manager.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const allowed = new Set([
  "AWS_REGION", "AWS_ACCOUNT_ID", "AWS_DEPLOY_ROLE_ARN", "ECS_CLUSTER", "ECS_PRIVATE_SUBNETS",
  "ECS_SECURITY_GROUP", "API_REPOSITORY", "PORTAL_REPOSITORY", "API_TASK_FAMILY", "PORTAL_TASK_FAMILY",
  "WORKER_TASK_FAMILY", "MIGRATION_TASK_FAMILY", "APP_ORIGIN", "OIDC_PATIENT_ISSUER_URL",
  "OIDC_PATIENT_AUDIENCE", "OIDC_PATIENT_JWKS_URL", "OIDC_WORKFORCE_ISSUER_URL",
  "OIDC_WORKFORCE_AUDIENCE", "OIDC_WORKFORCE_JWKS_URL", "AUDIT_SINK_URL", "ENABLE_ENCRYPTED_RECORDS"
]);
const values = JSON.parse(readFileSync(0, "utf8"));
if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Expected Terraform output object");
for (const [name, value] of Object.entries(values)) {
  if (!allowed.has(name) || typeof value !== "string" || !value) throw new Error(`Unsupported or empty variable: ${name}`);
}
if (Object.keys(values).length !== allowed.size) throw new Error("Missing deployment variables");
if (values.AWS_ACCOUNT_ID !== "066849628041" || values.ECS_CLUSTER !== "mwanamke-staging" || values.ENABLE_ENCRYPTED_RECORDS !== "false") {
  throw new Error("Only the designated staging account with encrypted records disabled is supported");
}
if (process.argv.includes("--apply")) {
  for (const [name, value] of Object.entries(values)) {
    const result = spawnSync("gh", ["variable", "set", name, "--repo", "tympersie22/Mwanamke", "--env", "staging-release-gate", "--body", value], { stdio: ["ignore", "ignore", "pipe"] });
    if (result.error || result.status !== 0) throw new Error(`Could not set ${name}; check GitHub authorization`);
    console.log(`Configured ${name}`);
  }
} else {
  console.log(`Validated ${allowed.size} public staging variables. Re-run with --apply to configure GitHub.`);
}
