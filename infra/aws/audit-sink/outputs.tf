output "sink_url" {
  value = "${aws_apigatewayv2_api.sink.api_endpoint}/events"
}
output "sink_token_secret_arn" {
  value = aws_secretsmanager_secret.sink_token.arn
}
output "audit_bucket_arn" {
  value = aws_s3_bucket.audit.arn
}
output "audit_kms_key_arn" {
  value = aws_kms_key.audit.arn
}
