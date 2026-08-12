terraform {
  backend "s3" {
    bucket              = "daf-routing-tfstate-326364278889-us-east-1"
    key                 = "bootstrap/terraform.tfstate"
    region              = "us-east-1"
    profile             = "daf-routing"
    encrypt             = true
    use_lockfile        = true
    allowed_account_ids = ["326364278889"]
  }
}
