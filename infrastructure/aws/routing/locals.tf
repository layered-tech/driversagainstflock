locals {
  common_tags = {
    Environment = "production"
    ManagedBy   = "terraform"
    Project     = "daf-routing"
  }

  graph_bucket_name     = "daf-routing-graphs-${var.aws_account_id}-${var.aws_region}"
  graph_bucket_arn      = "arn:aws:s3:::${local.graph_bucket_name}"
  serving_log_group_arn = "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/daf-routing/serving"
  builder_log_group_arn = "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/daf-routing/builder"
  alerts_topic_arn      = "arn:aws:sns:${var.aws_region}:${var.aws_account_id}:daf-routing-alerts"
  private_zone_name     = "daf-routing.internal"
  graphhopper_dns_name  = "graphhopper.${local.private_zone_name}"
  graphhopper_url       = "http://${local.graphhopper_dns_name}:8080"
}
