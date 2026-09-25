terraform {
  required_version = ">= 1.13.0, < 2.0.0"
  backend "s3" {}
  required_providers {
    auth0 = { source = "auth0/auth0", version = "~> 1.58" }
  }
}

provider "auth0" {
  alias         = "patient"
  domain        = var.patient_management_domain
  client_id     = var.patient_management_client_id
  client_secret = var.patient_management_client_secret
}

provider "auth0" {
  alias         = "workforce"
  domain        = var.workforce_management_domain
  client_id     = var.workforce_management_client_id
  client_secret = var.workforce_management_client_secret
}
