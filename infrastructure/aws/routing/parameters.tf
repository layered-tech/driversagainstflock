resource "aws_ssm_parameter" "graph_artifact_bucket" {
  name        = "/daf-routing/graph-artifact-bucket"
  description = "S3 bucket containing versioned GraphHopper graph artifacts"
  type        = "String"
  value       = aws_s3_bucket.graphs.id

  tags = {
    Name = "daf-routing-graph-artifact-bucket"
  }
}

resource "aws_ssm_parameter" "graph_artifact_prefix" {
  name        = "/daf-routing/graph-artifact-prefix"
  description = "Prefix containing the active GraphHopper graph release"
  type        = "String"
  value       = "releases/current"

  tags = {
    Name = "daf-routing-graph-artifact-prefix"
  }
}

resource "aws_ssm_parameter" "service_url" {
  name        = "/daf-routing/service-url"
  description = "Private GraphHopper endpoint used by Laravel"
  type        = "String"
  value       = local.graphhopper_url

  tags = {
    Name = "daf-routing-service-url"
  }
}
