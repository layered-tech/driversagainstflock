resource "aws_cloudwatch_log_group" "database" {
  name              = "/daf-osm/runtime"
  retention_in_days = 30

  tags = merge(local.common_tags, {
    Name = "daf-osm-runtime"
  })
}

resource "aws_sns_topic" "alerts" {
  name = "daf-osm-alerts"

  tags = merge(local.common_tags, {
    Name = "daf-osm-alerts"
  })
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
    resources = [aws_sns_topic.alerts.arn]
  }

  statement {
    sid    = "AllowCloudWatchAlarmsToPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values = [
        "arn:aws:cloudwatch:${var.aws_region}:${var.aws_account_id}:alarm:daf-osm-*",
      ]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }
  }

  statement {
    sid    = "AllowBudgetsToPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }

    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }
  }

  statement {
    sid    = "AllowCostAnomalyDetectionToPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["costalerts.amazonaws.com"]
    }

    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

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

resource "aws_cloudwatch_metric_alarm" "database_status" {
  alarm_name          = "daf-osm-database-status-check"
  alarm_description   = "The OSM database instance has failed an EC2 status check"
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
    InstanceId = aws_instance.database.id
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-database-status-check"
  })
}

resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "daf-osm-database-high-cpu"
  alarm_description   = "The OSM database CPU has exceeded 85 percent for 15 minutes"
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
    InstanceId = aws_instance.database.id
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-database-high-cpu"
  })
}

resource "aws_cloudwatch_metric_alarm" "data_volume_usage" {
  alarm_name          = "daf-osm-data-volume-high-usage"
  alarm_description   = "The OSM PostgreSQL data volume has exceeded 85 percent usage for 15 minutes"
  namespace           = "DAF/OSM"
  metric_name         = "DataVolumeUsedPercent"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.database.id
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-data-volume-high-usage"
  })
}

resource "aws_cloudwatch_metric_alarm" "memory_usage" {
  alarm_name          = "daf-osm-database-high-memory"
  alarm_description   = "The OSM database memory has exceeded 90 percent usage for 15 minutes"
  namespace           = "DAF/OSM"
  metric_name         = "MemoryUsedPercent"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 90
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.database.id
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-database-high-memory"
  })
}

resource "aws_cloudwatch_metric_alarm" "postgresql_health" {
  alarm_name          = "daf-osm-postgresql-unavailable"
  alarm_description   = "PostgreSQL has not reported healthy for three consecutive minutes"
  namespace           = "DAF/OSM"
  metric_name         = "PostgreSQLUp"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.database.id
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-postgresql-unavailable"
  })
}

resource "aws_cloudwatch_metric_alarm" "replication_freshness" {
  alarm_name          = "daf-osm-replication-stale"
  alarm_description   = "OSM minute replication is more than 10 minutes behind for 10 minutes"
  namespace           = "DAF/OSM"
  metric_name         = "ReplicationLagSeconds"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 600
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.database.id
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-replication-stale"
  })
}

resource "aws_cloudwatch_metric_alarm" "replication_failure" {
  alarm_name          = "daf-osm-replication-failure"
  alarm_description   = "An OSM current or history replication update has failed"
  namespace           = "DAF/OSM"
  metric_name         = "ReplicationUpdateFailures"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.database.id
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-replication-failure"
  })
}

resource "aws_cloudwatch_metric_alarm" "history_freshness" {
  alarm_name          = "daf-osm-history-stale"
  alarm_description   = "The append-only OSM history projection is more than one hour behind"
  namespace           = "DAF/OSM"
  metric_name         = "HistoryLagSeconds"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 3600
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.database.id
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-history-stale"
  })
}

resource "aws_cloudwatch_metric_alarm" "backup_freshness" {
  alarm_name          = "daf-osm-backup-stale"
  alarm_description   = "No successful PostgreSQL backup has completed in the last 25 hours"
  namespace           = "DAF/OSM"
  metric_name         = "BackupAgeSeconds"
  statistic           = "Maximum"
  period              = 3600
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 90000
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.database.id
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-backup-stale"
  })
}

resource "aws_cloudwatch_metric_alarm" "backup_failure" {
  alarm_name          = "daf-osm-backup-failure"
  alarm_description   = "A PostgreSQL backup or upload has failed"
  namespace           = "DAF/OSM"
  metric_name         = "BackupFailures"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.database.id
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-backup-failure"
  })
}

resource "aws_cloudwatch_metric_alarm" "publication_parity" {
  alarm_name          = "daf-osm-publication-parity-mismatch"
  alarm_description   = "The osm2pgsql staging and published current ALPR node counts disagree"
  namespace           = "DAF/OSM"
  metric_name         = "PublicationParityMismatch"
  statistic           = "Maximum"
  period              = 900
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.database.id
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-publication-parity-mismatch"
  })
}

resource "aws_cloudwatch_dashboard" "osm" {
  dashboard_name = "daf-osm"

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
            # DAF OSM / osm2pgsql
            Private PostgreSQL/PostGIS and osm2pgsql minute-replication infrastructure in ${var.aws_region}. Alerts publish to **daf-osm-alerts**. Cost controls are the **$300/month daf-osm-monthly budget** and **daf-osm-project anomaly monitor**; AWS does not expose their project-filtered spend as CloudWatch metrics, so amounts remain in Billing and Cost Management.
          MARKDOWN
        }
      },
      {
        type   = "alarm"
        x      = 0
        y      = 3
        width  = 24
        height = 6
        properties = {
          alarms = [
            aws_cloudwatch_metric_alarm.database_status.arn,
            aws_cloudwatch_metric_alarm.database_cpu.arn,
            aws_cloudwatch_metric_alarm.data_volume_usage.arn,
            aws_cloudwatch_metric_alarm.memory_usage.arn,
            aws_cloudwatch_metric_alarm.postgresql_health.arn,
            aws_cloudwatch_metric_alarm.replication_freshness.arn,
            aws_cloudwatch_metric_alarm.replication_failure.arn,
            aws_cloudwatch_metric_alarm.history_freshness.arn,
            aws_cloudwatch_metric_alarm.backup_freshness.arn,
            aws_cloudwatch_metric_alarm.backup_failure.arn,
            aws_cloudwatch_metric_alarm.publication_parity.arn,
          ]
          title = "OSM alarms"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 9
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.database.id, { label = "CPU used (%)" }],
            ["AWS/EC2", "StatusCheckFailed", "InstanceId", aws_instance.database.id, { label = "Status check failures", stat = "Maximum", yAxis = "right" }],
            ["DAF/OSM", "MemoryUsedPercent", "InstanceId", aws_instance.database.id, { label = "Memory used (%)" }],
            ["DAF/OSM", "DataVolumeUsedPercent", "InstanceId", aws_instance.database.id, { label = "Data volume used (%)" }],
          ]
          period = 300
          region = var.aws_region
          stat   = "Average"
          title  = "Database instance health"
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
        y      = 9
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/EBS", "VolumeReadOps", "VolumeId", aws_ebs_volume.data.id, { label = "Read operations", stat = "Sum" }],
            ["AWS/EBS", "VolumeWriteOps", "VolumeId", aws_ebs_volume.data.id, { label = "Write operations", stat = "Sum" }],
            ["AWS/EBS", "VolumeQueueLength", "VolumeId", aws_ebs_volume.data.id, { label = "Queue length", stat = "Average", yAxis = "right" }],
          ]
          period = 300
          region = var.aws_region
          title  = "Persistent database volume"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 15
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["DAF/OSM", "PostgreSQLUp", "InstanceId", aws_instance.database.id, { label = "PostgreSQL healthy", stat = "Minimum" }],
            ["DAF/OSM", "ReplicationLagSeconds", "InstanceId", aws_instance.database.id, { label = "Replication lag (seconds)" }],
            ["DAF/OSM", "ReplicationUpdateFailures", "InstanceId", aws_instance.database.id, { label = "Update failures", stat = "Sum", yAxis = "right" }],
            ["DAF/OSM", "LastSuccessfulReplicationUnixTime", "InstanceId", aws_instance.database.id, { label = "Last success (Unix time)", stat = "Maximum", visible = false }],
          ]
          period = 300
          region = var.aws_region
          stat   = "Maximum"
          title  = "Minute replication"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 15
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["DAF/OSM", "CurrentAlprNodeCount", "InstanceId", aws_instance.database.id, { label = "Current ALPR nodes" }],
            ["DAF/OSM", "HistoryEventCount", "InstanceId", aws_instance.database.id, { label = "History events" }],
            ["DAF/OSM", "ReplicationSequence", "InstanceId", aws_instance.database.id, { label = "Replication sequence", yAxis = "right" }],
            ["DAF/OSM", "HistoryBootstrapComplete", "InstanceId", aws_instance.database.id, { label = "History bootstrap complete", yAxis = "right" }],
          ]
          period = 300
          region = var.aws_region
          stat   = "Maximum"
          title  = "Publication and history volume"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 21
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["DAF/OSM", "HistoryLagSeconds", "InstanceId", aws_instance.database.id, { label = "History lag (seconds)" }],
            ["DAF/OSM", "BackupAgeSeconds", "InstanceId", aws_instance.database.id, { label = "Backup age (seconds)" }],
            ["DAF/OSM", "BackupFailures", "InstanceId", aws_instance.database.id, { label = "Backup failures", stat = "Sum", yAxis = "right" }],
            ["DAF/OSM", "PublicationParityMismatch", "InstanceId", aws_instance.database.id, { label = "Parity mismatches", stat = "Maximum", yAxis = "right" }],
          ]
          period = 900
          region = var.aws_region
          stat   = "Maximum"
          title  = "History, backups, and parity"
          view   = "timeSeries"
        }
      },
      {
        type   = "text"
        x      = 12
        y      = 21
        width  = 12
        height = 6
        properties = {
          markdown = <<-MARKDOWN
            ## Cost controls

            - Monthly budget: **$300**, filtered to `Project=daf-osm`
            - Actual alerts: **$150** and **$250**
            - Forecast alert: **100%** of the monthly budget
            - Immediate anomaly alert: at least **$10** and **20%** impact

            Budget and anomaly data can have normal AWS billing and model-evaluation delay.
          MARKDOWN
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 27
        width  = 24
        height = 6
        properties = {
          query  = "SOURCE '${aws_cloudwatch_log_group.database.name}' | fields @timestamp, @message, service, event, result, exit_code, replication_sequence, lag_seconds, history_lag_seconds, backup_age_seconds, parity_mismatch, detail | sort @timestamp desc | limit 50"
          region = var.aws_region
          title  = "Recent OSM database and replication logs"
          view   = "table"
        }
      },
    ]
  })
}

resource "aws_budgets_budget" "monthly" {
  name             = "daf-osm-monthly"
  billing_view_arn = "arn:aws:billing::${var.aws_account_id}:billingview/primary"
  budget_type      = "COST"
  limit_amount     = "300"
  limit_unit       = "USD"
  time_unit        = "MONTHLY"
  metrics          = ["UnblendedCost"]

  filter_expression {
    tags {
      key    = "Project"
      values = ["daf-osm"]
    }
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 150
    threshold_type            = "ABSOLUTE_VALUE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 250
    threshold_type            = "ABSOLUTE_VALUE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-monthly"
  })

  depends_on = [aws_sns_topic_policy.alerts]
}

resource "aws_ce_anomaly_monitor" "project" {
  name         = "daf-osm-project"
  monitor_type = "CUSTOM"

  monitor_specification = jsonencode({
    Tags = {
      Key    = "Project"
      Values = ["daf-osm"]
    }
  })

  tags = merge(local.common_tags, {
    Name = "daf-osm-project"
  })
}

resource "aws_ce_anomaly_subscription" "immediate" {
  name      = "daf-osm-immediate"
  frequency = "IMMEDIATE"

  monitor_arn_list = [aws_ce_anomaly_monitor.project.arn]

  subscriber {
    type    = "SNS"
    address = aws_sns_topic.alerts.arn
  }

  threshold_expression {
    and {
      dimension {
        key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
        match_options = ["GREATER_THAN_OR_EQUAL"]
        values        = ["10"]
      }
    }

    and {
      dimension {
        key           = "ANOMALY_TOTAL_IMPACT_PERCENTAGE"
        match_options = ["GREATER_THAN_OR_EQUAL"]
        values        = ["20"]
      }
    }
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-immediate"
  })

  depends_on = [aws_sns_topic_policy.alerts]
}
