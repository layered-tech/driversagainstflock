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

resource "aws_cloudwatch_metric_alarm" "shared_feed_freshness" {
  alarm_name          = "daf-osm-shared-feed-stale"
  alarm_description   = "The shared global OSM minute feed is more than 10 minutes behind"
  namespace           = "DAF/OSM"
  metric_name         = "SharedFeedSourceLagSeconds"
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
    Name = "daf-osm-shared-feed-stale"
  })
}

resource "aws_cloudwatch_metric_alarm" "shared_feed_failure" {
  alarm_name          = "daf-osm-shared-feed-failure"
  alarm_description   = "The shared global OSM feed acquisition or orchestration failed"
  namespace           = "DAF/OSM"
  metric_name         = "SharedFeedFailures"
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
    Name = "daf-osm-shared-feed-failure"
  })
}

resource "aws_cloudwatch_metric_alarm" "current_consumer_failure" {
  alarm_name          = "daf-osm-current-consumer-failure"
  alarm_description   = "The global current projection consumer failed"
  namespace           = "DAF/OSM"
  metric_name         = "CurrentConsumerFailures"
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
    Name = "daf-osm-current-consumer-failure"
  })
}

resource "aws_cloudwatch_metric_alarm" "history_consumer_failure" {
  alarm_name          = "daf-osm-history-consumer-failure"
  alarm_description   = "The global history projection consumer failed"
  namespace           = "DAF/OSM"
  metric_name         = "HistoryConsumerFailures"
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
    Name = "daf-osm-history-consumer-failure"
  })
}

resource "aws_cloudwatch_metric_alarm" "current_consumer_freshness" {
  alarm_name          = "daf-osm-current-consumer-stale"
  alarm_description   = "The global current projection is more than 10 minutes behind"
  namespace           = "DAF/OSM"
  metric_name         = "CurrentConsumerLagSeconds"
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
    Name = "daf-osm-current-consumer-stale"
  })
}

moved {
  from = aws_cloudwatch_metric_alarm.history_freshness
  to   = aws_cloudwatch_metric_alarm.history_consumer_freshness
}

resource "aws_cloudwatch_metric_alarm" "history_consumer_freshness" {
  alarm_name          = "daf-osm-history-stale"
  alarm_description   = "The append-only OSM history projection is more than one hour behind"
  namespace           = "DAF/OSM"
  metric_name         = "HistoryConsumerLagSeconds"
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

resource "aws_cloudwatch_metric_alarm" "retained_spool" {
  alarm_name          = "daf-osm-shared-feed-spool-retained"
  alarm_description   = "A shared global replication batch has remained uncommitted for 10 minutes"
  namespace           = "DAF/OSM"
  metric_name         = "SharedFeedRetainedBatchCount"
  statistic           = "Maximum"
  period              = 300
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
    Name = "daf-osm-shared-feed-spool-retained"
  })
}

resource "aws_cloudwatch_metric_alarm" "current_cursor_divergence" {
  alarm_name          = "daf-osm-current-cursor-divergence"
  alarm_description   = "The global current consumer remains more than five sequences from the shared feed"
  namespace           = "DAF/OSM"
  metric_name         = "CurrentConsumerCursorDivergence"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.database.id
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-current-cursor-divergence"
  })
}

resource "aws_cloudwatch_metric_alarm" "history_cursor_divergence" {
  alarm_name          = "daf-osm-history-cursor-divergence"
  alarm_description   = "The global history consumer remains more than five sequences from the shared feed"
  namespace           = "DAF/OSM"
  metric_name         = "HistoryConsumerCursorDivergence"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = aws_instance.database.id
  }

  tags = merge(local.common_tags, {
    Name = "daf-osm-history-cursor-divergence"
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
            aws_cloudwatch_metric_alarm.shared_feed_freshness.arn,
            aws_cloudwatch_metric_alarm.shared_feed_failure.arn,
            aws_cloudwatch_metric_alarm.current_consumer_freshness.arn,
            aws_cloudwatch_metric_alarm.current_consumer_failure.arn,
            aws_cloudwatch_metric_alarm.history_consumer_freshness.arn,
            aws_cloudwatch_metric_alarm.history_consumer_failure.arn,
            aws_cloudwatch_metric_alarm.retained_spool.arn,
            aws_cloudwatch_metric_alarm.current_cursor_divergence.arn,
            aws_cloudwatch_metric_alarm.history_cursor_divergence.arn,
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
          period  = 60
          region  = var.aws_region
          stat    = "Average"
          stacked = false
          title   = "Database instance health"
          view    = "timeSeries"
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
          period  = 60
          region  = var.aws_region
          stacked = false
          title   = "Persistent database volume"
          view    = "timeSeries"
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
            ["DAF/OSM", "SharedFeedSourceLagSeconds", "InstanceId", aws_instance.database.id, { label = "Shared source lag (seconds)" }],
            ["DAF/OSM", "CurrentConsumerLagSeconds", "InstanceId", aws_instance.database.id, { label = "Current lag (seconds)" }],
            ["DAF/OSM", "HistoryConsumerLagSeconds", "InstanceId", aws_instance.database.id, { label = "History lag (seconds)" }],
            ["DAF/OSM", "SharedFeedFailures", "InstanceId", aws_instance.database.id, { label = "Feed failures", stat = "Sum", yAxis = "right" }],
            ["DAF/OSM", "CurrentConsumerFailures", "InstanceId", aws_instance.database.id, { label = "Current failures", stat = "Sum", yAxis = "right" }],
            ["DAF/OSM", "HistoryConsumerFailures", "InstanceId", aws_instance.database.id, { label = "History failures", stat = "Sum", yAxis = "right" }],
            ["DAF/OSM", "LastSuccessfulReplicationUnixTime", "InstanceId", aws_instance.database.id, { label = "Last success (Unix time)", stat = "Maximum", visible = false }],
          ]
          period               = 60
          region               = var.aws_region
          setPeriodToTimeRange = true
          stacked              = false
          stat                 = "Maximum"
          title                = "Minute replication"
          view                 = "timeSeries"
          legend = {
            position = "right"
          }
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
            ["DAF/OSM", "SharedFeedSequence", "InstanceId", aws_instance.database.id, { label = "Shared feed sequence", yAxis = "right" }],
            ["DAF/OSM", "CurrentConsumerSequence", "InstanceId", aws_instance.database.id, { label = "Current sequence", yAxis = "right" }],
            ["DAF/OSM", "HistoryConsumerSequence", "InstanceId", aws_instance.database.id, { label = "History sequence", yAxis = "right" }],
            ["DAF/OSM", "HistoryBootstrapComplete", "InstanceId", aws_instance.database.id, { label = "History bootstrap complete", yAxis = "right" }],
          ]
          period               = 60
          region               = var.aws_region
          setPeriodToTimeRange = true
          stacked              = false
          stat                 = "Maximum"
          title                = "Publication and history volume"
          view                 = "bar"
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
            ["DAF/OSM", "SharedFeedRetainedBatchCount", "InstanceId", aws_instance.database.id, { label = "Retained spool batches" }],
            ["DAF/OSM", "CurrentConsumerCursorDivergence", "InstanceId", aws_instance.database.id, { label = "Current cursor divergence" }],
            ["DAF/OSM", "HistoryConsumerCursorDivergence", "InstanceId", aws_instance.database.id, { label = "History cursor divergence" }],
            ["DAF/OSM", "BackupAgeSeconds", "InstanceId", aws_instance.database.id, { label = "Backup age (seconds)" }],
            ["DAF/OSM", "BackupFailures", "InstanceId", aws_instance.database.id, { label = "Backup failures", stat = "Sum", yAxis = "right" }],
            ["DAF/OSM", "PublicationParityMismatch", "InstanceId", aws_instance.database.id, { label = "Parity mismatches", stat = "Maximum", yAxis = "right" }],
          ]
          period = 60
          region = var.aws_region
          stat   = "Maximum"
          title  = "History, backups, and parity"
          view   = "timeSeries"
          legend = {
            position = "right"
          }
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
    And            = null
    CostCategories = null
    Dimensions     = null
    Not            = null
    Or             = null
    Tags = {
      Key          = "user:Project"
      MatchOptions = null
      Values       = ["daf-osm"]
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
