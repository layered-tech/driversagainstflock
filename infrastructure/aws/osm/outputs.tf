output "artifact_bucket_name" {
  description = "Private versioned S3 bucket containing OSM bootstrap artifacts."
  value       = aws_s3_bucket.artifacts.id
}

output "backup_bucket_name" {
  description = "Private versioned S3 bucket containing PostgreSQL backups."
  value       = aws_s3_bucket.backups.id
}

output "cloudwatch_dashboard_name" {
  description = "Unified CloudWatch dashboard for the shared host, OSM, GraphHopper, and graph builder."
  value       = aws_cloudwatch_dashboard.unified.dashboard_name
}

output "data_volume_id" {
  description = "Protected encrypted EBS volume containing PostgreSQL, osm2pgsql state, retained history, and working data."
  value       = aws_ebs_volume.data_canonical.id
}

output "database_dns_name" {
  description = "Private Route 53 hostname for the PostgreSQL and osm2pgsql host."
  value       = local.database_dns_name
}

output "database_endpoint_parameter_name" {
  description = "SSM parameter containing the private PostgreSQL hostname."
  value       = aws_ssm_parameter.database_endpoint.name
}

output "database_instance_id" {
  description = "Persistent private PostgreSQL and osm2pgsql EC2 instance."
  value       = aws_instance.database.id
}

output "database_private_ip" {
  description = "Stable private IPv4 address assigned to the database ENI."
  value       = var.database_private_ip
}

output "database_security_group_id" {
  description = "Security group allowing PostgreSQL only from the protected Moonlit Laravel security group."
  value       = aws_security_group.database.id
}

output "nat_gateway_id" {
  description = "Existing daf-routing NAT gateway shared for OSM outbound internet access."
  value       = data.aws_nat_gateway.routing.id
}

output "private_route_table_id" {
  description = "OSM-only private route table using the shared routing NAT and S3 gateway endpoint."
  value       = aws_route_table.private.id
}

output "private_subnet_id" {
  description = "OSM-only private subnet containing the persistent database host."
  value       = aws_subnet.private.id
}

output "publisher_password_parameter_name" {
  description = "SecureString parameter populated by bootstrap with the application publisher password."
  value       = local.publisher_password_parameter_name
}

output "publisher_username_parameter_name" {
  description = "String parameter populated by bootstrap with the application publisher username."
  value       = local.publisher_username_parameter_name
}

output "s3_vpc_endpoint_id" {
  description = "S3 gateway endpoint scoped to the OSM private route table."
  value       = aws_vpc_endpoint.s3.id
}
