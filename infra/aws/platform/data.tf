resource "aws_kms_key" "application" {
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Sid = "AccountAdministration", Effect = "Allow", Principal = { AWS = "arn:aws:iam::${var.account_id}:root" }, Action = "kms:*", Resource = "*" },
    { Sid = "EncryptedLogs", Effect = "Allow", Principal = { Service = "logs.${var.aws_region}.amazonaws.com" }, Action = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"], Resource = "*", Condition = { ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${var.aws_region}:${var.account_id}:log-group:/mwanamke/${var.environment}/*" } } },
    { Sid = "AlarmNotifications", Effect = "Allow", Principal = { Service = "cloudwatch.amazonaws.com" }, Action = ["kms:Decrypt", "kms:GenerateDataKey*"], Resource = "*", Condition = { StringEquals = { "aws:SourceAccount" = var.account_id } } }
  ] })
  description             = "Encrypts MWANAMKE ${var.environment} application data"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  lifecycle { prevent_destroy = true }
}
resource "aws_kms_alias" "application" {
  name          = "alias/mwanamke/${var.environment}/application"
  target_key_id = aws_kms_key.application.key_id
}

resource "random_password" "database" {
  length  = 40
  special = false
}
resource "random_password" "redis" {
  length  = 48
  special = false
}
resource "random_password" "identity_hmac" {
  length  = 64
  special = false
}
resource "random_password" "audit_hmac" {
  length  = 64
  special = false
}
resource "random_password" "portal_session" {
  length  = 96
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = values(aws_subnet.data)[*].id
}
resource "aws_db_instance" "postgres" {
  identifier                      = local.name
  engine                          = "postgres"
  engine_version                  = "16"
  instance_class                  = var.environment == "production" ? "db.t4g.medium" : "db.t4g.small"
  allocated_storage               = 50
  max_allocated_storage           = 250
  storage_type                    = "gp3"
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.application.arn
  db_name                         = "mwanamke"
  username                        = "mwanamke_app"
  password                        = random_password.database.result
  port                            = 5432
  multi_az                        = true
  publicly_accessible             = false
  db_subnet_group_name            = aws_db_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.database.id]
  backup_retention_period         = 35
  backup_window                   = "00:30-01:30"
  maintenance_window              = "sun:02:00-sun:03:00"
  deletion_protection             = true
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${local.name}-final"
  copy_tags_to_snapshot           = true
  auto_minor_version_upgrade      = true
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.application.arn
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  parameter_group_name            = aws_db_parameter_group.postgres.name
  lifecycle { prevent_destroy = true }
}
resource "aws_db_parameter_group" "postgres" {
  name   = "${local.name}-postgres16"
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_connections"
    value = "1"
  }
  parameter {
    name  = "log_disconnections"
    value = "1"
  }
  parameter {
    name  = "log_statement"
    value = "ddl"
  }
}

resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = values(aws_subnet.data)[*].id
}
resource "aws_elasticache_replication_group" "rate_limit" {
  replication_group_id       = "${local.name}-limits"
  description                = "Distributed rate limits for MWANAMKE"
  engine                     = "valkey"
  node_type                  = "cache.t4g.small"
  port                       = 6379
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis.result
  kms_key_id                 = aws_kms_key.application.arn
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.cache.id]
  snapshot_retention_limit   = 7
  snapshot_window            = "02:00-03:00"
  maintenance_window         = "sun:03:00-sun:04:00"
  apply_immediately          = false
}

resource "aws_secretsmanager_secret" "runtime" {
  name                    = "mwanamke/${var.environment}/runtime"
  kms_key_id              = aws_kms_key.application.arn
  recovery_window_in_days = 30
}
resource "aws_secretsmanager_secret_version" "runtime" {
  secret_id = aws_secretsmanager_secret.runtime.id
  secret_string = jsonencode({
    DATABASE_URL                 = "postgresql://mwanamke_app:${urlencode(random_password.database.result)}@${aws_db_instance.postgres.address}:5432/mwanamke?sslmode=require"
    REDIS_URL                    = "rediss://default:${urlencode(random_password.redis.result)}@${aws_elasticache_replication_group.rate_limit.primary_endpoint_address}:6379"
    IDENTITY_SUBJECT_HMAC_KEY    = random_password.identity_hmac.result
    AUDIT_HMAC_KEY               = random_password.audit_hmac.result
    AUDIT_SINK_TOKEN             = var.audit_sink_token
    PORTAL_SESSION_KEY           = random_password.portal_session.result
    OIDC_PATIENT_CLIENT_SECRET   = var.patient_oidc_client_secret
    OIDC_WORKFORCE_CLIENT_SECRET = var.workforce_oidc_client_secret
  })
}
