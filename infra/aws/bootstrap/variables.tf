variable "aws_profile" {
  description = "Local AWS CLI profile for the management account."
  type        = string
  default     = "mwanamke-management"
}

variable "aws_region" {
  description = "Primary AWS region for MWANAMKE infrastructure."
  type        = string
  default     = "eu-north-1"
}

variable "management_account_id" {
  description = "AWS Organizations management account ID."
  type        = string
  default     = "409310897955"

  validation {
    condition     = can(regex("^[0-9]{12}$", var.management_account_id))
    error_message = "management_account_id must contain 12 digits."
  }
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket used for Terraform state."
  type        = string
  default     = "mwanamke-terraform-state-409310897955-eu-north-1"
}

variable "state_retention_days" {
  description = "Days to retain noncurrent state object versions."
  type        = number
  default     = 365

  validation {
    condition     = var.state_retention_days >= 90
    error_message = "State history must be retained for at least 90 days."
  }
}
