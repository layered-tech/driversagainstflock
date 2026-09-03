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
        "arn:aws:cloudwatch:${var.aws_region}:${var.aws_account_id}:alarm:daf-infrastructure-shared-host-*",
        "arn:aws:cloudwatch:${var.aws_region}:${var.aws_account_id}:alarm:daf-infrastructure-osm-*",
        "arn:aws:cloudwatch:${var.aws_region}:${var.aws_account_id}:alarm:daf-infrastructure-postgresql-*",
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
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-shared-host-status-check"
  alarm_description   = "The shared OSM and GraphHopper host has failed an EC2 status check"
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
    Name = "daf-infrastructure-shared-host-status-check"
  })
}

resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-shared-host-high-cpu"
  alarm_description   = "The shared OSM and GraphHopper host CPU has exceeded 85 percent for 15 minutes"
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
    Name = "daf-infrastructure-shared-host-high-cpu"
  })
}

resource "aws_cloudwatch_metric_alarm" "data_volume_usage" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-osm-data-volume-high-usage"
  alarm_description   = "The canonical PostgreSQL data volume has exceeded 85 percent usage for 15 minutes"
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
    Name = "daf-infrastructure-osm-data-volume-high-usage"
  })
}

resource "aws_cloudwatch_metric_alarm" "memory_usage" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-shared-host-high-memory"
  alarm_description   = "The shared OSM and GraphHopper host memory has exceeded 90 percent usage for 15 minutes"
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
    Name = "daf-infrastructure-shared-host-high-memory"
  })
}

resource "aws_cloudwatch_metric_alarm" "postgresql_health" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-postgresql-unavailable"
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
    Name = "daf-infrastructure-postgresql-unavailable"
  })
}

resource "aws_cloudwatch_metric_alarm" "shared_feed_freshness" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-osm-shared-feed-stale"
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
    Name = "daf-infrastructure-osm-shared-feed-stale"
  })
}

resource "aws_cloudwatch_metric_alarm" "shared_feed_failure" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-osm-shared-feed-failure"
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
    Name = "daf-infrastructure-osm-shared-feed-failure"
  })
}

resource "aws_cloudwatch_metric_alarm" "current_consumer_failure" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-osm-current-consumer-failure"
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
    Name = "daf-infrastructure-osm-current-consumer-failure"
  })
}

resource "aws_cloudwatch_metric_alarm" "history_consumer_failure" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-osm-history-consumer-failure"
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
    Name = "daf-infrastructure-osm-history-consumer-failure"
  })
}

resource "aws_cloudwatch_metric_alarm" "current_consumer_freshness" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-osm-current-consumer-stale"
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
    Name = "daf-infrastructure-osm-current-consumer-stale"
  })
}

moved {
  from = aws_cloudwatch_metric_alarm.history_freshness
  to   = aws_cloudwatch_metric_alarm.history_consumer_freshness
}

resource "aws_cloudwatch_metric_alarm" "history_consumer_freshness" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-osm-history-stale"
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
    Name = "daf-infrastructure-osm-history-stale"
  })
}

resource "aws_cloudwatch_metric_alarm" "retained_spool" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-osm-shared-feed-spool-retained"
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
    Name = "daf-infrastructure-osm-shared-feed-spool-retained"
  })
}

resource "aws_cloudwatch_metric_alarm" "current_cursor_divergence" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-osm-current-cursor-divergence"
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
    Name = "daf-infrastructure-osm-current-cursor-divergence"
  })
}

resource "aws_cloudwatch_metric_alarm" "history_cursor_divergence" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-osm-history-cursor-divergence"
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
    Name = "daf-infrastructure-osm-history-cursor-divergence"
  })
}

resource "aws_cloudwatch_metric_alarm" "backup_freshness" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-postgresql-backup-stale"
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
    Name = "daf-infrastructure-postgresql-backup-stale"
  })
}

resource "aws_cloudwatch_metric_alarm" "backup_failure" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-postgresql-backup-failure"
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
    Name = "daf-infrastructure-postgresql-backup-failure"
  })
}

resource "aws_cloudwatch_metric_alarm" "publication_parity" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-osm-publication-parity-mismatch"
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
    Name = "daf-infrastructure-osm-publication-parity-mismatch"
  })
}
