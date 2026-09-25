data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" { state = "available" }

locals {
  name = "mwanamke-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)
  tags = {
    Application        = "MWANAMKE"
    Environment        = var.environment
    ManagedBy          = "Terraform"
    DataClassification = "restricted-health-metadata"
    RegionScope        = "Tanzania-Zanzibar"
  }
  api_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "HOST", value = "0.0.0.0" },
    { name = "PORT", value = "4100" },
    { name = "APP_ORIGIN", value = "https://${var.domain_name}" },
    { name = "STATE_STORE", value = "postgres" },
    { name = "AUTH_MODE", value = "oidc" },
    { name = "ALLOW_DEMO_AUTH", value = "false" },
    { name = "ALLOW_DEMO_DATA", value = "false" },
    { name = "ENABLE_ENCRYPTED_RECORDS", value = tostring(var.enable_encrypted_records) },
    { name = "OIDC_PATIENT_ISSUER_URL", value = var.patient_oidc_issuer_url },
    { name = "OIDC_PATIENT_AUDIENCE", value = var.patient_oidc_audience },
    { name = "OIDC_PATIENT_JWKS_URL", value = var.patient_oidc_jwks_url },
    { name = "OIDC_WORKFORCE_ISSUER_URL", value = var.workforce_oidc_issuer_url },
    { name = "OIDC_WORKFORCE_AUDIENCE", value = var.workforce_oidc_audience },
    { name = "OIDC_WORKFORCE_JWKS_URL", value = var.workforce_oidc_jwks_url },
    { name = "OIDC_AUTH_METHODS_CLAIM", value = "https://mwanamke.africa/amr" },
    { name = "AUDIT_SINK_URL", value = var.audit_sink_url },
    { name = "PAYMENT_ADAPTER", value = "disabled" },
    { name = "NOTIFICATION_ADAPTER", value = "disabled" },
    { name = "TELECONSULT_ADAPTER", value = "disabled" },
    { name = "BLOODMATCH_ADAPTER", value = "disabled" },
    { name = "TRUST_PROXY", value = "true" },
    { name = "LOG_LEVEL", value = "info" }
  ]
  secret_arn = aws_secretsmanager_secret.runtime.arn
  api_secrets = [
    { name = "DATABASE_URL", valueFrom = "${local.secret_arn}:DATABASE_URL::" },
    { name = "REDIS_URL", valueFrom = "${local.secret_arn}:REDIS_URL::" },
    { name = "IDENTITY_SUBJECT_HMAC_KEY", valueFrom = "${local.secret_arn}:IDENTITY_SUBJECT_HMAC_KEY::" },
    { name = "AUDIT_HMAC_KEY", valueFrom = "${local.secret_arn}:AUDIT_HMAC_KEY::" },
    { name = "AUDIT_SINK_TOKEN", valueFrom = "${local.secret_arn}:AUDIT_SINK_TOKEN::" }
  ]
}

check "target_account" {
  assert {
    condition     = data.aws_caller_identity.current.account_id == var.account_id
    error_message = "This root must run in the selected staging or production application account."
  }
}

check "records_gate" {
  assert {
    condition     = !var.enable_encrypted_records
    error_message = "Encrypted records stay disabled in this infrastructure root until independent security and privacy approvals are supplied through a separate reviewed release."
  }
}
