variable "aws_account_id" {
  description = "AWS account that owns both the existing application and routing stack."
  type        = string
  default     = "326364278889"
}

variable "aws_profile" {
  description = "Local AWS CLI profile used only for Terraform operator actions."
  type        = string
  default     = "daf-routing"
}

variable "aws_region" {
  description = "AWS region for the routing stack."
  type        = string
  default     = "us-east-1"
}

variable "alert_email" {
  description = "Email endpoint for the one-time SNS confirmation and routing budget alerts."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be a valid email address."
  }
}

variable "attach_graph_legacy_volume" {
  description = "Whether the protected legacy graph volume remains attached to the routing host."
  type        = bool
  default     = false
}

variable "vpc_id" {
  description = "Existing production VPC, read through a data source and never managed here."
  type        = string
  default     = "vpc-0ca7765532da9cf89"
}

variable "public_subnet_id" {
  description = "Existing public subnet used only to host the new NAT gateway."
  type        = string
  default     = "subnet-0aec59f0da18b6c9c"
}

variable "public_route_table_id" {
  description = "Existing public route table checked for its current IGW route but never managed here."
  type        = string
  default     = "rtb-09c13b6fad4fbc07b"
}

variable "internet_gateway_id" {
  description = "Existing internet gateway expected on the protected public route table."
  type        = string
  default     = "igw-07923c83d382676c2"
}

variable "laravel_instance_id" {
  description = "Existing Moonlit Cloud Laravel instance used only for topology validation."
  type        = string
  default     = "i-0b983523680d2bf7d"
}

variable "laravel_security_group_id" {
  description = "Existing Laravel security group allowed to reach GraphHopper on port 8080."
  type        = string
  default     = "sg-0a4ca901836e1b34b"
}

variable "private_subnet_cidr" {
  description = "CIDR for the newly owned routing-only private subnet."
  type        = string
  default     = "10.0.2.0/24"
}

variable "serving_private_ip" {
  description = "Stable private address assigned to the serving ENI."
  type        = string
  default     = "10.0.2.10"
}

variable "serving_instance_type" {
  description = "GraphHopper serving instance size."
  type        = string
  default     = "r7g.large"
}

variable "builder_instance_type" {
  description = "On-demand ARM builder size with 128 GiB RAM."
  type        = string
  default     = "r8g.4xlarge"
}

variable "graph_volume_size_gib" {
  description = "Canonical persistent gp3 graph volume size in GiB."
  type        = number
  default     = 64

  validation {
    condition     = var.graph_volume_size_gib == 64
    error_message = "graph_volume_size_gib must remain 64 GiB during the consolidation migration."
  }
}
