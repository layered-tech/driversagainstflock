terraform {
  required_version = "~> 1.16.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region              = "us-east-1"
  profile             = "daf-routing"
  allowed_account_ids = ["326364278889"]

  default_tags {
    tags = {
      Environment = "production"
      ManagedBy   = "terraform"
      Project     = "daf-routing"
    }
  }
}
