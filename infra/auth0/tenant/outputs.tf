output "patient_issuer_url" { value = local.patient_issuer }
output "patient_jwks_url" { value = "${local.patient_issuer}.well-known/jwks.json" }
output "patient_api_audience" { value = auth0_resource_server.patient.identifier }
output "patient_web_client_id" { value = auth0_client.patient_web.client_id }
output "patient_web_client_secret" {
  value     = auth0_client_credentials.patient_web.client_secret
  sensitive = true
}
output "patient_mobile_client_id" { value = auth0_client.patient_mobile.client_id }
output "workforce_issuer_url" { value = local.workforce_issuer }
output "workforce_jwks_url" { value = "${local.workforce_issuer}.well-known/jwks.json" }
output "workforce_api_audience" { value = auth0_resource_server.workforce.identifier }
output "workforce_web_client_id" { value = auth0_client.workforce_web.client_id }
output "workforce_web_client_secret" {
  value     = auth0_client_credentials.workforce_web.client_secret
  sensitive = true
}
