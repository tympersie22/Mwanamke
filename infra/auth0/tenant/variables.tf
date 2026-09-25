variable "environment" {
  type    = string
  default = "staging"
}
variable "application_origin" { type = string }
variable "support_email" {
  type        = string
  description = "Approved support address displayed during authentication."
}
variable "patient_api_audience" {
  type    = string
  default = "https://api.mwanamke.africa/patient"
}
variable "workforce_api_audience" {
  type    = string
  default = "https://api.mwanamke.africa/workforce"
}
variable "mobile_callback_url" {
  type    = string
  default = "mwanamke://auth/callback"
}
variable "patient_management_domain" { type = string }
variable "patient_management_client_id" {
  type      = string
  sensitive = true
}
variable "patient_management_client_secret" {
  type      = string
  sensitive = true
}
variable "workforce_management_domain" { type = string }
variable "workforce_management_client_id" {
  type      = string
  sensitive = true
}
variable "workforce_management_client_secret" {
  type      = string
  sensitive = true
}
