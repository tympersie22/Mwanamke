variable "aws_profile" {
  type    = string
  default = "mwanamke-security"
}
variable "aws_region" {
  type    = string
  default = "eu-north-1"
}
variable "security_account_id" {
  type    = string
  default = "540087633014"
}
variable "environment" {
  type    = string
  default = "staging"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}
variable "retention_days" {
  type    = number
  default = 365
  validation {
    condition     = var.retention_days >= 90
    error_message = "Audit retention must be at least 90 days."
  }
}
variable "object_lock_mode" {
  type    = string
  default = "GOVERNANCE"
  validation {
    condition     = contains(["GOVERNANCE", "COMPLIANCE"], var.object_lock_mode)
    error_message = "Use GOVERNANCE or COMPLIANCE."
  }
  validation {
    condition     = var.environment != "production" || var.object_lock_mode == "COMPLIANCE"
    error_message = "Production audit objects require COMPLIANCE Object Lock."
  }
}
variable "bucket_name" {
  type    = string
  default = "mwanamke-audit-540087633014-eu-north-1"
}
