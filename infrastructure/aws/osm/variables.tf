variable "alert_email" {
  description = "Email endpoint for the one-time SNS confirmation and OSM infrastructure alerts."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be a valid email address."
  }
}

variable "amazon_linux_arm64_parameter_name" {
  description = "Public SSM parameter resolving the approved Amazon Linux 2023 ARM64 AMI."
  type        = string
  default     = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

variable "aws_account_id" {
  description = "AWS account that owns the existing application, routing stack, and OSM stack."
  type        = string
  default     = "326364278889"
}

variable "aws_profile" {
  description = "Local AWS CLI profile used only for Terraform operator actions."
  type        = string
  default     = "daf-routing"
}

variable "aws_region" {
  description = "AWS region for the OSM stack."
  type        = string
  default     = "us-east-1"
}

variable "backup_prefix" {
  description = "S3 key prefix reserved for PostgreSQL backups."
  type        = string
  default     = "postgresql"

  validation {
    condition     = trim(var.backup_prefix, "/") != ""
    error_message = "backup_prefix must contain a non-slash character."
  }
}

variable "attach_graph_volume_to_shared_host" {
  description = "Whether to attach the routing-owned canonical graph volume to the shared OSM host."
  type        = bool
  default     = true
}

variable "bootstrap_artifact_key" {
  description = "Versioned S3 object key containing the PostgreSQL and osm2pgsql bootstrap asset bundle."
  type        = string
  default     = "bootstrap/osm-stack-v1.tar.gz"

  validation {
    condition     = trim(var.bootstrap_artifact_key, "/") != ""
    error_message = "bootstrap_artifact_key must contain a non-slash character."
  }
}

variable "data_device" {
  description = "Requested Linux device name for the canonical persistent OSM data volume."
  type        = string
  default     = "/dev/sdh"

  validation {
    condition     = startswith(var.data_device, "/dev/")
    error_message = "data_device must be an absolute device path under /dev."
  }
}

variable "data_iops" {
  description = "Provisioned IOPS for the persistent gp3 OSM data volume."
  type        = number
  default     = 3000

  validation {
    condition     = var.data_iops >= 3000 && var.data_iops <= 80000
    error_message = "data_iops must be between 3000 and 80000."
  }
}

variable "data_mount_path" {
  description = "Persistent mount point containing PostgreSQL, osm2pgsql state, retained history, and working data."
  type        = string
  default     = "/var/lib/daf-osm"

  validation {
    condition     = startswith(var.data_mount_path, "/") && var.data_mount_path != "/"
    error_message = "data_mount_path must be an absolute path other than root."
  }
}

variable "data_throughput_mibps" {
  description = "Provisioned throughput in MiB/s for the persistent gp3 OSM data volume."
  type        = number
  default     = 125

  validation {
    condition     = var.data_throughput_mibps >= 125 && var.data_throughput_mibps <= 2000
    error_message = "data_throughput_mibps must be between 125 and 2000."
  }
}

variable "data_volume_size_gib" {
  description = "Canonical OSM data volume size in GiB for the consolidated host."
  type        = number
  default     = 256

  validation {
    condition     = var.data_volume_size_gib == 256
    error_message = "data_volume_size_gib must remain the reviewed 256 GiB size."
  }
}

variable "database_instance_type" {
  description = "ARM EC2 instance type for the persistent PostgreSQL and osm2pgsql host."
  type        = string
  default     = "r7g.large"
}

variable "database_name" {
  description = "PostgreSQL database name created for OSM current-state and historical data."
  type        = string
  default     = "daf_osm"

  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{0,62}$", var.database_name))
    error_message = "database_name must be a lowercase PostgreSQL identifier no longer than 63 characters."
  }
}

variable "database_port" {
  description = "Private PostgreSQL listener port allowed only from the Moonlit Laravel security group."
  type        = number
  default     = 5432

  validation {
    condition     = var.database_port >= 1 && var.database_port <= 65535
    error_message = "database_port must be between 1 and 65535."
  }
}

variable "database_private_ip" {
  description = "Stable private IPv4 address assigned to the PostgreSQL host ENI."
  type        = string
  default     = "10.0.3.10"

  validation {
    condition     = var.database_private_ip == "10.0.3.10"
    error_message = "database_private_ip must remain the approved address 10.0.3.10."
  }
}

variable "graph_device" {
  description = "Device name used when the routing-owned graph volume moves to the shared host."
  type        = string
  default     = "/dev/sdi"

  validation {
    condition = (
      startswith(var.graph_device, "/dev/") &&
      var.graph_device != var.data_device
    )
    error_message = "graph_device must be a distinct absolute device path under /dev."
  }
}

variable "internet_gateway_id" {
  description = "Existing internet gateway expected on the protected public route table."
  type        = string
  default     = "igw-07923c83d382676c2"
}

variable "laravel_instance_id" {
  description = "Existing Moonlit Cloud Laravel instance used only for protected-topology validation."
  type        = string
  default     = "i-0b983523680d2bf7d"
}

variable "laravel_security_group_id" {
  description = "Existing Laravel security group allowed to reach PostgreSQL on the private database port."
  type        = string
  default     = "sg-0a4ca901836e1b34b"
}

variable "private_subnet_cidr" {
  description = "CIDR for the Terraform-owned OSM private subnet."
  type        = string
  default     = "10.0.3.0/24"

  validation {
    condition     = var.private_subnet_cidr == "10.0.3.0/24"
    error_message = "private_subnet_cidr must remain the approved OSM CIDR 10.0.3.0/24."
  }
}

variable "public_route_table_id" {
  description = "Existing protected public route table checked for its approved internet-gateway route."
  type        = string
  default     = "rtb-09c13b6fad4fbc07b"
}

variable "public_subnet_id" {
  description = "Existing protected public subnet containing Moonlit and the shared routing NAT gateway."
  type        = string
  default     = "subnet-0aec59f0da18b6c9c"
}

variable "root_volume_size_gib" {
  description = "Encrypted gp3 root volume size in GiB for the rebuildable database host operating system."
  type        = number
  default     = 40

  validation {
    condition     = var.root_volume_size_gib >= 30 && var.root_volume_size_gib <= 100
    error_message = "root_volume_size_gib must be between 30 and 100 GiB."
  }
}

variable "routing_state_bucket" {
  description = "Protected S3 bucket containing the existing routing Terraform remote state."
  type        = string
  default     = "daf-routing-tfstate-326364278889-us-east-1"
}

variable "routing_graph_volume_id" {
  description = "Temporary fallback canonical graph volume ID until routing state publishes its output."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.routing_graph_volume_id == null || can(regex("^vol-[0-9a-f]{17}$", var.routing_graph_volume_id))
    error_message = "routing_graph_volume_id must be null or a valid EBS volume ID."
  }
}

variable "routing_serving_security_group_id" {
  description = "Existing routing security-group ID used until routing state publishes its output."
  type        = string
  default     = "sg-0538f9bdcfcbfeb6f"

  validation {
    condition     = can(regex("^sg-[0-9a-f]{17}$", var.routing_serving_security_group_id))
    error_message = "routing_serving_security_group_id must be a valid security-group ID."
  }
}

variable "routing_state_key" {
  description = "Remote-state key exporting the existing routing NAT gateway and private subnet IDs."
  type        = string
  default     = "routing/terraform.tfstate"
}

variable "vpc_id" {
  description = "Existing production VPC, read through a data source and never managed by the OSM root."
  type        = string
  default     = "vpc-0ca7765532da9cf89"
}
