output "state_bucket_name" {
  description = "S3 bucket used for Terraform state and native lock files."
  value       = aws_s3_bucket.terraform_state.id
}

output "routing_backend" {
  description = "Backend settings to apply to the routing stack after bootstrap."
  value = {
    bucket              = aws_s3_bucket.terraform_state.id
    key                 = "routing/terraform.tfstate"
    region              = "us-east-1"
    use_lockfile        = true
    encrypt             = true
    profile             = "daf-routing"
    allowed_account_ids = ["326364278889"]
  }
}
