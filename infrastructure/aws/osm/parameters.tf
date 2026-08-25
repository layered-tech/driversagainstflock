resource "aws_ssm_parameter" "artifact_bucket" {
  name        = "/daf-osm/artifact-bucket"
  description = "Private S3 bucket containing versioned OSM host bootstrap artifacts"
  type        = "String"
  value       = aws_s3_bucket.artifacts.id

  tags = {
    Name = "daf-osm-artifact-bucket"
  }
}

resource "aws_ssm_parameter" "backup_bucket" {
  name        = "/daf-osm/backup-bucket"
  description = "Private S3 bucket containing PostgreSQL backups"
  type        = "String"
  value       = aws_s3_bucket.backups.id

  tags = {
    Name = "daf-osm-backup-bucket"
  }
}

resource "aws_ssm_parameter" "data_mount_path" {
  name        = local.data_mount_parameter_name
  description = "Persistent mount point containing PostgreSQL, osm2pgsql state, retained history, and working data"
  type        = "String"
  value       = var.data_mount_path

  tags = {
    Name = "daf-osm-data-mount-path"
  }
}

resource "aws_ssm_parameter" "database_endpoint" {
  name        = local.database_endpoint_parameter_name
  description = "Private Route 53 hostname for PostgreSQL"
  type        = "String"
  value       = local.database_dns_name

  tags = {
    Name = "daf-osm-database-endpoint"
  }
}

resource "aws_ssm_parameter" "database_name" {
  name        = local.database_name_parameter_name
  description = "PostgreSQL database containing OSM current-state and historical data"
  type        = "String"
  value       = var.database_name

  tags = {
    Name = "daf-osm-database-name"
  }
}

resource "aws_ssm_parameter" "database_port" {
  name        = local.database_port_parameter_name
  description = "Private PostgreSQL listener port"
  type        = "String"
  value       = tostring(var.database_port)

  tags = {
    Name = "daf-osm-database-port"
  }
}
