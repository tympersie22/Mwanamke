output "staging_assignment" {
  description = "Human access granted by this Terraform root."
  value = {
    account_id         = aws_ssoadmin_account_assignment.groot_staging_administrator.target_id
    permission_set_arn = aws_ssoadmin_account_assignment.groot_staging_administrator.permission_set_arn
    principal_id       = aws_ssoadmin_account_assignment.groot_staging_administrator.principal_id
  }
}
