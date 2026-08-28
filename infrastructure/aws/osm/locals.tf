locals {
  common_tags = {
    Environment = "production"
    ManagedBy   = "terraform"
    Project     = "daf-osm"
  }

  artifact_bucket_name = "daf-osm-artifacts-${var.aws_account_id}-${var.aws_region}"
  artifact_bucket_arn  = "arn:aws:s3:::${local.artifact_bucket_name}"
  backup_bucket_name   = "daf-osm-backups-${var.aws_account_id}-${var.aws_region}"
  backup_bucket_arn    = "arn:aws:s3:::${local.backup_bucket_name}"

  cloudwatch_namespace = "DAF/OSM"
  database_dns_name    = "database.${local.private_zone_name}"
  private_zone_name    = "daf-osm.internal"

  data_mount_parameter_name        = "/daf-osm/data-mount-path"
  database_endpoint_parameter_name = "/daf-osm/database/endpoint"
  database_name_parameter_name     = "/daf-osm/database/name"
  database_port_parameter_name     = "/daf-osm/database/port"

  publisher_password_parameter_name = "/daf-osm/database/publisher-password"
  publisher_username_parameter_name = "/daf-osm/database/publisher-username"
}
