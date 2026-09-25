variable "aws_profile" {
  type    = string
  default = "mwanamke-staging"
}
variable "aws_region" {
  type    = string
  default = "eu-north-1"
}
variable "account_id" {
  type    = string
  default = "066849628041"
}
variable "environment" {
  type    = string
  default = "staging"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}
variable "domain_name" {
  type        = string
  description = "Public portal/API hostname, such as staging.mwanamke.africa."
}
variable "hosted_zone_id" {
  type        = string
  description = "Route53 public hosted zone containing domain_name."
}
variable "patient_oidc_issuer_url" { type = string }
variable "patient_oidc_audience" { type = string }
variable "patient_oidc_jwks_url" { type = string }
variable "patient_oidc_client_id" { type = string }
variable "patient_oidc_client_secret" {
  type      = string
  sensitive = true
}
variable "workforce_oidc_issuer_url" { type = string }
variable "workforce_oidc_audience" { type = string }
variable "workforce_oidc_jwks_url" { type = string }
variable "workforce_oidc_client_id" { type = string }
variable "workforce_oidc_client_secret" {
  type      = string
  sensitive = true
}
variable "mobile_oidc_client_id" { type = string }
variable "audit_sink_url" { type = string }
variable "audit_sink_token" {
  type      = string
  sensitive = true
}
variable "api_image" {
  type        = string
  description = "Immutable API image URI including digest."
}
variable "migration_image" {
  type        = string
  description = "Immutable API migration image URI including digest."
}
variable "portal_image" {
  type        = string
  description = "Immutable portal image URI including digest."
}
variable "service_desired_count" {
  type    = number
  default = 0
  validation {
    condition     = var.service_desired_count >= 0 && var.service_desired_count <= 10
    error_message = "service_desired_count must be between 0 and 10."
  }
}
variable "alarm_email" {
  type    = string
  default = ""
}
variable "backup_copy_vault_arn" {
  type    = string
  default = ""
}
variable "enable_encrypted_records" {
  type    = bool
  default = false
  validation {
    condition     = !var.enable_encrypted_records
    error_message = "Encrypted records require a separate reviewed release after security and privacy approval."
  }
}
