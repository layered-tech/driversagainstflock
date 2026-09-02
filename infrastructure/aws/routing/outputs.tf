output "serving_instance_id" {
  description = "Persistent GraphHopper serving instance."
  value       = aws_instance.serving.id
}

output "serving_private_ip" {
  description = "Stable private address on the persistent serving ENI."
  value       = var.serving_private_ip
}

output "serving_private_url" {
  description = "Private Route 53 endpoint for Laravel."
  value       = local.graphhopper_url
}

output "graph_artifact_bucket" {
  description = "Private versioned S3 bucket for graph releases."
  value       = aws_s3_bucket.graphs.id
}

output "graph_volume_id" {
  description = "Canonical encrypted EBS volume for GraphHopper graph releases."
  value       = aws_ebs_volume.graph_canonical.id
}

output "builder_launch_template_id" {
  description = "Launch template used by the separately approved on-demand build workflow."
  value       = aws_launch_template.builder.id
}

output "private_subnet_id" {
  description = "Routing-only private subnet."
  value       = aws_subnet.routing_private.id
}

output "serving_security_group_id" {
  description = "Security group allowing GraphHopper requests from Laravel."
  value       = aws_security_group.serving.id
}

output "nat_gateway_id" {
  description = "NAT gateway providing outbound-only access for routing workloads."
  value       = aws_nat_gateway.routing.id
}

output "cloudwatch_dashboard_name" {
  description = "CloudWatch dashboard for GraphHopper infrastructure health and operational metrics."
  value       = aws_cloudwatch_dashboard.routing.dashboard_name
}
