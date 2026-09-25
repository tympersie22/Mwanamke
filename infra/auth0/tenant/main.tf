locals {
  patient_issuer   = "https://${trimsuffix(var.patient_management_domain, "/")}/"
  workforce_issuer = "https://${trimsuffix(var.workforce_management_domain, "/")}/"
  callback_url     = "${trimsuffix(var.application_origin, "/")}/auth/callback"
  logout_url       = trimsuffix(var.application_origin, "/")
}

resource "auth0_tenant" "patient" {
  provider                = auth0.patient
  friendly_name           = "MWANAMKE"
  enabled_locales         = ["sw", "en"]
  support_email           = var.support_email
  support_url             = "${local.logout_url}/support"
  allowed_logout_urls     = [local.logout_url]
  default_redirection_uri = local.logout_url
  session_lifetime        = 24
  idle_session_lifetime   = 2
  session_cookie { mode = "non-persistent" }
  flags {
    disable_clickjack_protection_headers   = false
    enable_public_signup_user_exists_error = false
    enable_legacy_profile                  = false
  }
}

resource "auth0_tenant" "workforce" {
  provider                          = auth0.workforce
  friendly_name                     = "MWANAMKE Workforce"
  enabled_locales                   = ["sw", "en"]
  support_email                     = var.support_email
  support_url                       = "${local.logout_url}/support"
  allowed_logout_urls               = [local.logout_url]
  default_redirection_uri           = local.logout_url
  session_lifetime                  = 8
  idle_session_lifetime             = 1
  customize_mfa_in_postlogin_action = true
  session_cookie { mode = "non-persistent" }
  flags {
    disable_clickjack_protection_headers   = false
    enable_public_signup_user_exists_error = false
    enable_legacy_profile                  = false
  }
}

resource "auth0_attack_protection" "patient" {
  provider = auth0.patient
  breached_password_detection {
    enabled = true
    method  = "enhanced"
    shields = ["block", "admin_notification"]
  }
  brute_force_protection {
    enabled      = true
    max_attempts = 5
    mode         = "count_per_identifier_and_ip"
    shields      = ["block", "user_notification"]
  }
  suspicious_ip_throttling {
    enabled = true
    shields = ["block", "admin_notification"]
  }
}

resource "auth0_attack_protection" "workforce" {
  provider = auth0.workforce
  breached_password_detection {
    enabled = true
    method  = "enhanced"
    shields = ["block", "admin_notification"]
  }
  brute_force_protection {
    enabled      = true
    max_attempts = 5
    mode         = "count_per_identifier_and_ip"
    shields      = ["block", "user_notification"]
  }
  suspicious_ip_throttling {
    enabled = true
    shields = ["block", "admin_notification"]
  }
}

resource "auth0_resource_server" "patient" {
  provider                                        = auth0.patient
  name                                            = "MWANAMKE Patient API"
  identifier                                      = var.patient_api_audience
  signing_alg                                     = "RS256"
  token_lifetime                                  = 900
  token_lifetime_for_web                          = 900
  allow_offline_access                            = true
  skip_consent_for_verifiable_first_party_clients = true
}

resource "auth0_resource_server" "workforce" {
  provider                                        = auth0.workforce
  name                                            = "MWANAMKE Workforce API"
  identifier                                      = var.workforce_api_audience
  signing_alg                                     = "RS256"
  token_lifetime                                  = 900
  token_lifetime_for_web                          = 900
  allow_offline_access                            = false
  skip_consent_for_verifiable_first_party_clients = true
}

resource "auth0_connection" "patient" {
  provider = auth0.patient
  name     = "mwanamke-patients"
  strategy = "auth0"
  options {
    disable_signup         = false
    brute_force_protection = true
    password_policy        = "excellent" # gitleaks:allow (Auth0 policy-strength enum)
    authentication_methods {
      password { enabled = true }
      passkey { enabled = true }
    }
    passkey_options {
      local_enrollment_enabled       = true
      progressive_enrollment_enabled = true
    }
  }
}

resource "auth0_connection" "workforce" {
  provider = auth0.workforce
  name     = "mwanamke-workforce"
  strategy = "auth0"
  options {
    disable_signup                       = true
    disable_self_service_change_password = false
    brute_force_protection               = true
    password_policy                      = "excellent" # gitleaks:allow (Auth0 policy-strength enum)
    authentication_methods {
      password { enabled = true }
      passkey { enabled = true }
    }
    passkey_options {
      local_enrollment_enabled       = true
      progressive_enrollment_enabled = true
    }
  }
}

resource "auth0_guardian" "patient" {
  provider      = auth0.patient
  policy        = "confidence-score"
  otp           = false
  email         = false
  recovery_code = true
  webauthn_platform { enabled = true }
  webauthn_roaming {
    enabled           = true
    user_verification = "required"
  }
}

resource "auth0_guardian" "workforce" {
  provider      = auth0.workforce
  policy        = "never"
  otp           = false
  email         = false
  recovery_code = true
  webauthn_platform { enabled = true }
  webauthn_roaming {
    enabled           = true
    user_verification = "required"
  }
  settings {
    display_remember_me_checkbox   = false
    remember_me_default_value      = false
    mfa_session_inactivity_timeout = 3600
    mfa_session_overall_timeout    = 28800
  }
}

resource "auth0_client" "patient_web" {
  provider            = auth0.patient
  name                = "MWANAMKE Patient Portal (${var.environment})"
  app_type            = "regular_web"
  is_first_party      = true
  oidc_conformant     = true
  callbacks           = [local.callback_url]
  allowed_logout_urls = [local.logout_url]
  allowed_origins     = [local.logout_url]
  web_origins         = [local.logout_url]
  grant_types         = ["authorization_code", "refresh_token"]
  client_metadata     = { realm = "patient" }
  refresh_token {
    rotation_type       = "rotating"
    expiration_type     = "expiring"
    token_lifetime      = 2592000
    idle_token_lifetime = 604800
    leeway              = 10
  }
}

resource "auth0_client_credentials" "patient_web" {
  provider              = auth0.patient
  client_id             = auth0_client.patient_web.id
  authentication_method = "client_secret_post"
}

resource "auth0_client" "patient_mobile" {
  provider            = auth0.patient
  name                = "MWANAMKE Mobile (${var.environment})"
  app_type            = "native"
  is_first_party      = true
  oidc_conformant     = true
  callbacks           = [var.mobile_callback_url]
  allowed_logout_urls = [var.mobile_callback_url]
  grant_types         = ["authorization_code", "refresh_token"]
  client_metadata     = { realm = "patient" }
  refresh_token {
    rotation_type       = "rotating"
    expiration_type     = "expiring"
    token_lifetime      = 2592000
    idle_token_lifetime = 604800
    leeway              = 10
  }
}

resource "auth0_client_credentials" "patient_mobile" {
  provider              = auth0.patient
  client_id             = auth0_client.patient_mobile.id
  authentication_method = "none"
}

resource "auth0_client" "workforce_web" {
  provider            = auth0.workforce
  name                = "MWANAMKE Workforce Portal (${var.environment})"
  app_type            = "regular_web"
  is_first_party      = true
  oidc_conformant     = true
  callbacks           = [local.callback_url]
  allowed_logout_urls = [local.logout_url]
  allowed_origins     = [local.logout_url]
  web_origins         = [local.logout_url]
  grant_types         = ["authorization_code"]
  client_metadata     = { realm = "workforce" }
}

resource "auth0_client_credentials" "workforce_web" {
  provider              = auth0.workforce
  client_id             = auth0_client.workforce_web.id
  authentication_method = "client_secret_post"
}

resource "auth0_connection_client" "patient_web" {
  provider      = auth0.patient
  connection_id = auth0_connection.patient.id
  client_id     = auth0_client.patient_web.id
}
resource "auth0_connection_client" "patient_mobile" {
  provider      = auth0.patient
  connection_id = auth0_connection.patient.id
  client_id     = auth0_client.patient_mobile.id
}
resource "auth0_connection_client" "workforce_web" {
  provider      = auth0.workforce
  connection_id = auth0_connection.workforce.id
  client_id     = auth0_client.workforce_web.id
}

resource "auth0_action" "workforce_enforce_passkey" {
  provider = auth0.workforce
  name     = "MWANAMKE enforce workforce passkey"
  runtime  = "node22"
  deploy   = true
  code     = file("${path.module}/../actions/enforce-workforce-passkey.js")
  supported_triggers {
    id      = "post-login"
    version = "v3"
  }
}

resource "auth0_action" "workforce_emit_amr" {
  provider = auth0.workforce
  name     = "MWANAMKE emit workforce authentication method"
  runtime  = "node22"
  deploy   = true
  code     = file("${path.module}/../actions/require-workforce-passkey.js")
  supported_triggers {
    id      = "post-login"
    version = "v3"
  }
}

resource "auth0_trigger_actions" "workforce_post_login" {
  provider = auth0.workforce
  trigger  = "post-login"
  actions {
    id           = auth0_action.workforce_enforce_passkey.id
    display_name = auth0_action.workforce_enforce_passkey.name
  }
  actions {
    id           = auth0_action.workforce_emit_amr.id
    display_name = auth0_action.workforce_emit_amr.name
  }
}
