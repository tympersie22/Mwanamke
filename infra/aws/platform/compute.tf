resource "aws_ecr_repository" "api" {
  name                 = "mwanamke/api"
  image_tag_mutability = "IMMUTABLE"
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.application.arn
  }
  image_scanning_configuration { scan_on_push = true }
}
resource "aws_ecr_repository" "portal" {
  name                 = "mwanamke/portal"
  image_tag_mutability = "IMMUTABLE"
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.application.arn
  }
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role_policy" "ecs_secrets" {
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = aws_secretsmanager_secret.runtime.arn },
    { Effect = "Allow", Action = ["kms:Decrypt"], Resource = aws_kms_key.application.arn }
  ] })
}
resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/mwanamke/${var.environment}/api"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.application.arn
}
resource "aws_cloudwatch_log_group" "portal" {
  name              = "/mwanamke/${var.environment}/portal"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.application.arn
}
resource "aws_cloudwatch_log_group" "worker" {
  name              = "/mwanamke/${var.environment}/worker"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.application.arn
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([{
    name                   = "api", image = var.api_image, essential = true
    readonlyRootFilesystem = true
    portMappings           = [{ containerPort = 4100, hostPort = 4100, protocol = "tcp" }]
    environment            = local.api_environment
    secrets                = local.api_secrets
    logConfiguration       = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.api.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "api" } }
    healthCheck            = { command = ["CMD-SHELL", "wget -qO- http://127.0.0.1:4100/ready >/dev/null || exit 1"], interval = 30, timeout = 5, retries = 3, startPeriod = 30 }
    linuxParameters        = { initProcessEnabled = true }
  }])
}

resource "aws_ecs_task_definition" "portal" {
  family                   = "${local.name}-portal"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([{
    name                   = "portal", image = var.portal_image, essential = true
    readonlyRootFilesystem = true
    portMappings           = [{ containerPort = 3000, hostPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "API_BASE_URL", value = "https://${var.domain_name}" },
      { name = "PORTAL_ORIGIN", value = "https://${var.domain_name}" },
      { name = "ALLOW_DEMO_AUTH", value = "false" },
      { name = "MWANAMKE_LOCAL_DEMO", value = "false" },
      { name = "ENABLE_REVIEW_SURFACE", value = "false" },
      { name = "OIDC_PATIENT_ISSUER_URL", value = var.patient_oidc_issuer_url },
      { name = "OIDC_PATIENT_CLIENT_ID", value = var.patient_oidc_client_id },
      { name = "OIDC_PATIENT_AUDIENCE", value = var.patient_oidc_audience },
      { name = "OIDC_WORKFORCE_ISSUER_URL", value = var.workforce_oidc_issuer_url },
      { name = "OIDC_WORKFORCE_CLIENT_ID", value = var.workforce_oidc_client_id },
      { name = "OIDC_WORKFORCE_AUDIENCE", value = var.workforce_oidc_audience },
      { name = "OIDC_MOBILE_CLIENT_ID", value = var.mobile_oidc_client_id },
      { name = "OIDC_MOBILE_REDIRECT_URI", value = "mwanamke://auth/callback" }
    ]
    secrets = [
      { name = "PORTAL_SESSION_KEY", valueFrom = "${local.secret_arn}:PORTAL_SESSION_KEY::" },
      { name = "OIDC_PATIENT_CLIENT_SECRET", valueFrom = "${local.secret_arn}:OIDC_PATIENT_CLIENT_SECRET::" },
      { name = "OIDC_WORKFORCE_CLIENT_SECRET", valueFrom = "${local.secret_arn}:OIDC_WORKFORCE_CLIENT_SECRET::" }
    ]
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.portal.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "portal" } }
    healthCheck      = { command = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1"], interval = 30, timeout = 5, retries = 3, startPeriod = 45 }
    linuxParameters  = { initProcessEnabled = true }
  }])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([{
    name                   = "worker", image = var.api_image, essential = true, command = ["node", "dist/worker.js"]
    readonlyRootFilesystem = true
    environment            = concat(local.api_environment, [{ name = "WORKER_ID", value = "ecs-${var.environment}" }])
    secrets                = local.api_secrets
    logConfiguration       = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.worker.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "worker" } }
    linuxParameters        = { initProcessEnabled = true }
  }])
}

resource "aws_ecs_task_definition" "migration" {
  family                   = "${local.name}-migration"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([{
    name             = "migration", image = var.migration_image, essential = true, readonlyRootFilesystem = true
    environment      = [{ name = "NODE_ENV", value = "production" }]
    secrets          = [{ name = "DATABASE_URL", valueFrom = "${local.secret_arn}:DATABASE_URL::" }]
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.api.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "migration" } }
  }])
}
