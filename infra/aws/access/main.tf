resource "aws_ssoadmin_account_assignment" "groot_staging_administrator" {
  instance_arn       = var.identity_center_instance_arn
  permission_set_arn = var.administrator_permission_set_arn

  principal_id   = var.operator_user_id
  principal_type = "USER"

  target_id   = var.staging_account_id
  target_type = "AWS_ACCOUNT"
}
