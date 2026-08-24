resource "aws_cloudwatch_log_group" "serving" {
  name              = "/daf-routing/serving"
  retention_in_days = 30

  tags = {
    Name = "daf-routing-serving"
  }
}

resource "aws_cloudwatch_log_group" "builder" {
  name              = "/daf-routing/builder"
  retention_in_days = 30

  tags = {
    Name = "daf-routing-builder"
  }
}

resource "aws_sns_topic" "alerts" {
  name = "daf-routing-alerts"

  tags = {
    Name = "daf-routing-alerts"
  }
}

data "aws_iam_policy_document" "alerts" {
  statement {
    sid    = "AccountOwnerAdministration"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${var.aws_account_id}:root"]
    }

    actions = [
      "sns:AddPermission",
      "sns:DeleteTopic",
      "sns:GetTopicAttributes",
      "sns:ListSubscriptionsByTopic",
      "sns:Publish",
      "sns:RemovePermission",
      "sns:SetTopicAttributes",
      "sns:Subscribe",
    ]
    resources = [local.alerts_topic_arn]
  }

  statement {
    sid    = "AllowBudgetsToPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }

    actions   = ["sns:Publish"]
    resources = [local.alerts_topic_arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "serving_status" {
  alarm_name          = "daf-routing-serving-status-check"
  alarm_description   = "GraphHopper serving instance has failed an EC2 status check"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.serving.id
  }

  tags = {
    Name = "daf-routing-serving-status-check"
  }
}

resource "aws_cloudwatch_metric_alarm" "serving_cpu" {
  alarm_name          = "daf-routing-serving-high-cpu"
  alarm_description   = "GraphHopper serving CPU has exceeded 85 percent for 15 minutes"
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.serving.id
  }

  tags = {
    Name = "daf-routing-serving-high-cpu"
  }
}

resource "aws_cloudwatch_dashboard" "routing" {
  dashboard_name = "daf-routing"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 3
        properties = {
          markdown = <<-MARKDOWN
            # DAF Routing / GraphHopper
            Private GraphHopper routing infrastructure in ${var.aws_region}. The serving endpoint is ${local.graphhopper_dns_name}; access it through Laravel, not the public internet. Budget data is surfaced through the **daf-routing-monthly** alarm and can have normal AWS billing delay.
          MARKDOWN
        }
      },
      {
        type   = "alarm"
        x      = 0
        y      = 3
        width  = 24
        height = 4
        properties = {
          alarms = [
            aws_cloudwatch_metric_alarm.serving_status.arn,
            aws_cloudwatch_metric_alarm.serving_cpu.arn,
            aws_cloudwatch_metric_alarm.graph_build_scheduler_dlq.arn,
          ]
          title = "Routing alarms"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 7
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.serving.id, { label = "Serving CPU" }],
            [".", "StatusCheckFailed", ".", ".", { label = "Serving status check", stat = "Maximum", yAxis = "right" }],
            ["DAF/Routing", "ServingGraphVolumeUsedPercent", "InstanceId", aws_instance.serving.id, { label = "Graph volume used (%)" }],
            [".", "ServingMemoryUsedPercent", ".", ".", { label = "Memory used (%)" }],
          ]
          period = 60
          region = var.aws_region
          stat   = "Average"
          title  = "Serving instance health"
          view   = "timeSeries"
          yAxis = {
            left = {
              min = 0
              max = 100
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 7
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/EC2", "NetworkIn", "InstanceId", aws_instance.serving.id, { label = "Inbound bytes" }],
            [".", "NetworkOut", ".", ".", { label = "Outbound bytes" }],
          ]
          period = 300
          region = var.aws_region
          stat   = "Sum"
          title  = "Serving network traffic"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 13
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/NATGateway", "ActiveConnectionCount", "NatGatewayId", aws_nat_gateway.routing.id, { label = "Active connections" }],
            [".", "ErrorPortAllocation", ".", ".", { label = "Port allocation errors", stat = "Sum", yAxis = "right" }],
            [".", "PacketsDropCount", ".", ".", { label = "Dropped packets", stat = "Sum", yAxis = "right" }],
          ]
          period = 300
          region = var.aws_region
          stat   = "Average"
          title  = "Private-subnet NAT health"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 13
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/EBS", "VolumeReadOps", "VolumeId", aws_ebs_volume.graphs.id, { label = "Read operations" }],
            [".", "VolumeWriteOps", ".", ".", { label = "Write operations" }],
            [".", "VolumeQueueLength", ".", ".", { label = "Queue length", stat = "Average", yAxis = "right" }],
          ]
          period = 300
          region = var.aws_region
          stat   = "Sum"
          title  = "Persistent graph volume"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 19
        width  = 12
        height = 6
        properties = {
          metrics = [
            [{ expression = "SEARCH('{DAF/Routing,ReleaseId} MetricName=\"InitialGraphBuildElapsed\"', 'Maximum', 300)", id = "build_elapsed", label = "Build elapsed seconds" }],
            [{ expression = "SEARCH('{DAF/Routing,ReleaseId} MetricName=\"BuilderCpuUsed\"', 'Maximum', 300)", id = "builder_cpu", label = "Builder CPU used (%)", yAxis = "right" }],
            [{ expression = "SEARCH('{DAF/Routing,ReleaseId} MetricName=\"BuilderMemoryUsed\"', 'Maximum', 300)", id = "builder_memory", label = "Builder memory used (%)", yAxis = "right" }],
            [{ expression = "SEARCH('{DAF/Routing,ReleaseId} MetricName=\"BuilderScratchUsed\"', 'Maximum', 300)", id = "builder_scratch", label = "Builder scratch used (%)", yAxis = "right" }],
          ]
          period = 300
          region = var.aws_region
          title  = "Latest graph build"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 19
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/S3", "BucketSizeBytes", "BucketName", aws_s3_bucket.graphs.id, "StorageType", "StandardStorage", { label = "Graph artifact storage" }],
            [".", "NumberOfObjects", ".", ".", ".", "AllStorageTypes", { label = "Artifact objects", yAxis = "right" }],
          ]
          period = 86400
          region = var.aws_region
          stat   = "Average"
          title  = "Graph artifact bucket (daily)"
          view   = "timeSeries"
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 25
        width  = 24
        height = 6
        properties = {
          query  = "SOURCE '${aws_cloudwatch_log_group.serving.name}' | SOURCE '${aws_cloudwatch_log_group.builder.name}' | fields @timestamp, @log, role, event, service, active_state, sub_state, result, exit_code, restart_count, release_id, mode, state, phase, percent, detail | sort @timestamp desc | limit 20"
          region = var.aws_region
          title  = "Recent serving and builder logs"
          view   = "table"
        }
      },
    ]
  })
}

resource "aws_budgets_budget" "monthly" {
  name             = "daf-routing-monthly"
  billing_view_arn = "arn:aws:billing::${var.aws_account_id}:billingview/primary"
  budget_type      = "COST"
  limit_amount     = "150"
  limit_unit       = "USD"
  time_unit        = "MONTHLY"
  metrics          = ["UnblendedCost"]

  filter_expression {
    tags {
      key    = "Project"
      values = ["daf-routing"]
    }
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 75
    threshold_type            = "ABSOLUTE_VALUE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 125
    threshold_type            = "ABSOLUTE_VALUE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  tags = {
    Name = "daf-routing-monthly"
  }

  depends_on = [aws_sns_topic_policy.alerts]
}
