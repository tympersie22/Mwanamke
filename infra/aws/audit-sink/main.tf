data "aws_caller_identity" "current" {}

locals {
  tags = {
    Application        = "MWANAMKE"
    Environment        = var.environment
    ManagedBy          = "Terraform"
    DataClassification = "security-audit-metadata"
    RegionScope        = "Tanzania-Zanzibar"
  }
}

resource "aws_kms_key" "audit" {
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Sid = "AccountAdministration", Effect = "Allow", Principal = { AWS = "arn:aws:iam::${var.security_account_id}:root" }, Action = "kms:*", Resource = "*" },
    { Sid = "EncryptedLogs", Effect = "Allow", Principal = { Service = "logs.${var.aws_region}.amazonaws.com" }, Action = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"], Resource = "*", Condition = { ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${var.aws_region}:${var.security_account_id}:log-group:*mwanamke-${var.environment}-audit-sink" } } }
  ] })
  description             = "Encrypts append-only MWANAMKE audit evidence"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  lifecycle { prevent_destroy = true }
}
resource "aws_kms_alias" "audit" {
  name          = "alias/mwanamke/${var.environment}/audit"
  target_key_id = aws_kms_key.audit.key_id
}

resource "aws_s3_bucket" "audit" {
  bucket              = var.bucket_name
  object_lock_enabled = true
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_versioning" "audit" {
  bucket = aws_s3_bucket.audit.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_object_lock_configuration" "audit" {
  bucket = aws_s3_bucket.audit.id
  rule {
    default_retention {
      mode = var.object_lock_mode
      days = var.retention_days
    }
  }
  depends_on = [aws_s3_bucket_versioning.audit]
}
resource "aws_s3_bucket_public_access_block" "audit" {
  bucket                  = aws_s3_bucket.audit.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "audit" {
  bucket = aws_s3_bucket.audit.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.audit.arn
      sse_algorithm     = "aws:kms"
    }
  }
}
data "aws_iam_policy_document" "audit_bucket" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.audit.arn, "${aws_s3_bucket.audit.arn}/*"]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
resource "aws_s3_bucket_policy" "audit" {
  bucket = aws_s3_bucket.audit.id
  policy = data.aws_iam_policy_document.audit_bucket.json
}

resource "random_password" "sink_token" {
  length  = 48
  special = false
}
resource "aws_secretsmanager_secret" "sink_token" {
  name                    = "mwanamke/${var.environment}/audit-sink-token"
  kms_key_id              = aws_kms_key.audit.arn
  recovery_window_in_days = 30
}
resource "aws_secretsmanager_secret_version" "sink_token" {
  secret_id     = aws_secretsmanager_secret.sink_token.id
  secret_string = random_password.sink_token.result
}

data "archive_file" "sink" {
  type        = "zip"
  source_file = "${path.module}/sink.py"
  output_path = "${path.module}/sink.zip"
}
resource "aws_iam_role" "sink" {
  name = "mwanamke-${var.environment}-audit-sink"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy" "sink" {
  role = aws_iam_role.sink.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], Resource = "arn:aws:logs:${var.aws_region}:${var.security_account_id}:*" },
      { Effect = "Allow", Action = ["s3:PutObject", "s3:PutObjectRetention"], Resource = "${aws_s3_bucket.audit.arn}/*" },
      { Effect = "Allow", Action = ["kms:Encrypt", "kms:GenerateDataKey"], Resource = aws_kms_key.audit.arn }
    ]
  })
}
resource "aws_cloudwatch_log_group" "sink" {
  name              = "/aws/lambda/mwanamke-${var.environment}-audit-sink"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.audit.arn
}
resource "aws_lambda_function" "sink" {
  function_name                  = "mwanamke-${var.environment}-audit-sink"
  role                           = aws_iam_role.sink.arn
  handler                        = "sink.handler"
  runtime                        = "python3.13"
  filename                       = data.archive_file.sink.output_path
  source_code_hash               = data.archive_file.sink.output_base64sha256
  timeout                        = 10
  memory_size                    = 256
  reserved_concurrent_executions = 10
  environment {
    variables = {
      AUDIT_BUCKET      = aws_s3_bucket.audit.id
      AUDIT_KMS_KEY_ARN = aws_kms_key.audit.arn
      TOKEN_SHA256      = sha256(random_password.sink_token.result)
      RETENTION_DAYS    = tostring(var.retention_days)
      OBJECT_LOCK_MODE  = var.object_lock_mode
    }
  }
  depends_on = [aws_cloudwatch_log_group.sink]
}

resource "aws_apigatewayv2_api" "sink" {
  name          = "mwanamke-${var.environment}-audit-sink"
  protocol_type = "HTTP"
}
resource "aws_apigatewayv2_integration" "sink" {
  api_id                 = aws_apigatewayv2_api.sink.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.sink.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 10000
}
resource "aws_apigatewayv2_route" "sink" {
  api_id    = aws_apigatewayv2_api.sink.id
  route_key = "POST /events"
  target    = "integrations/${aws_apigatewayv2_integration.sink.id}"
}
resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/apigateway/mwanamke-${var.environment}-audit-sink"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.audit.arn
}
resource "aws_apigatewayv2_stage" "sink" {
  api_id      = aws_apigatewayv2_api.sink.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format          = jsonencode({ requestId = "$context.requestId", status = "$context.status", routeKey = "$context.routeKey", sourceIp = "$context.identity.sourceIp" })
  }
}
resource "aws_lambda_permission" "api" {
  statement_id  = "AllowAuditApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sink.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.sink.execution_arn}/*/*"
}
resource "aws_cloudwatch_metric_alarm" "errors" {
  alarm_name          = "mwanamke-${var.environment}-audit-sink-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  dimensions          = { FunctionName = aws_lambda_function.sink.function_name }
  treat_missing_data  = "notBreaching"
}

check "security_account" {
  assert {
    condition     = data.aws_caller_identity.current.account_id == var.security_account_id
    error_message = "Audit sink must be deployed from the separate security/log archive account."
  }
}
check "production_lock" {
  assert {
    condition     = var.environment != "production" || var.object_lock_mode == "COMPLIANCE"
    error_message = "Production audit objects require COMPLIANCE Object Lock."
  }
}
