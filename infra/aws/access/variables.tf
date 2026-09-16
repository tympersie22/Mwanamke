variable "aws_profile" {
  description = "Local AWS CLI profile for the management account."
  type        = string
  default     = "mwanamke-management"
}

variable "identity_center_region" {
  description = "Home region of IAM Identity Center."
  type        = string
  default     = "eu-north-1"
}

variable "identity_center_instance_arn" {
  description = "IAM Identity Center instance ARN."
  type        = string
  default     = "arn:aws:sso:::instance/ssoins-650882c3fedc6d33"
}

variable "administrator_permission_set_arn" {
  description = "Existing AdministratorAccess permission set ARN."
  type        = string
  default     = "arn:aws:sso:::permissionSet/ssoins-650882c3fedc6d33/ps-65080f7378fb1ee3"
}

variable "operator_user_id" {
  description = "Identity Store user ID for Groot."
  type        = string
  default     = "b07ca9ec-e011-700b-6f6c-7d682f4136cd"
}

variable "staging_account_id" {
  description = "AWS account ID for Staging."
  type        = string
  default     = "066849628041"

  validation {
    condition     = can(regex("^[0-9]{12}$", var.staging_account_id))
    error_message = "staging_account_id must contain 12 digits."
  }
}
