terraform {
  required_version = ">= 1.13.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {}
}

provider "aws" {
  profile = var.aws_profile
  region  = var.identity_center_region

  default_tags {
    tags = {
      Application        = "MWANAMKE"
      Environment        = "management"
      ManagedBy          = "Terraform"
      DataClassification = "restricted-metadata"
      RegionScope        = "Tanzania-Zanzibar"
    }
  }
}
