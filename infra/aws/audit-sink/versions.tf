terraform {
  required_version = ">= 1.13.0, < 2.0.0"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.7" }
    random  = { source = "hashicorp/random", version = "~> 3.7" }
  }
  backend "s3" {}
}

provider "aws" {
  profile             = var.aws_profile
  region              = var.aws_region
  allowed_account_ids = [var.security_account_id]
  default_tags { tags = local.tags }
}
