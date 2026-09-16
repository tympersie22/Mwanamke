output "state_bucket" {
  description = "S3 bucket for remote Terraform state."
  value       = aws_s3_bucket.terraform_state.id
}

output "state_kms_key_arn" {
  description = "KMS key used by the Terraform state bucket."
  value       = aws_kms_key.terraform_state.arn
}

output "backend_configuration" {
  description = "Non-secret settings used when initializing downstream Terraform roots."
  value = {
    bucket       = aws_s3_bucket.terraform_state.id
    region       = var.aws_region
    profile      = var.aws_profile
    use_lockfile = true
    encrypt      = true
    kms_key_id   = aws_kms_key.terraform_state.arn
  }
}
