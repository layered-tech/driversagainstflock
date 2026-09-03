resource "aws_cloudwatch_dashboard" "unified" {
  dashboard_name = "daf-infrastructure"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 4
        properties = {
          markdown = <<-MARKDOWN
            # DAF shared infrastructure
            Unified production view for PostgreSQL/PostGIS, OSM replication, GraphHopper serving, and the retained graph builder in ${var.aws_region}. The shared host is `${var.database_private_ip}`; application traffic uses the private database and GraphHopper DNS names. One **$150/month** budget covers the `daf-osm` and `daf-routing` projects.
          MARKDOWN
        }
      },
      {
        type   = "alarm"
        x      = 0
        y      = 4
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
            "arn:aws:cloudwatch:${var.aws_region}:${var.aws_account_id}:alarm:daf-infrastructure-routing-graph-build-scheduler-failures",
          ]
          title = "DAF unified alarms"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 10
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.database.id, { label = "Shared-host CPU used (%)" }],
            ["AWS/EC2", "StatusCheckFailed", "InstanceId", aws_instance.database.id, { label = "Status check failures", stat = "Maximum", yAxis = "right" }],
            ["DAF/OSM", "MemoryUsedPercent", "InstanceId", aws_instance.database.id, { label = "Shared-host memory used (%)" }],
            ["DAF/OSM", "DataVolumeUsedPercent", "InstanceId", aws_instance.database.id, { label = "OSM data volume used (%)" }],
            ["DAF/Routing", "ServingGraphVolumeUsedPercent", "InstanceId", aws_instance.database.id, { label = "Graph volume used (%)" }],
          ]
          period  = 60
          region  = var.aws_region
          stat    = "Average"
          stacked = false
          title   = "Shared-host health"
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
        y      = 10
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/EC2", "NetworkIn", "InstanceId", aws_instance.database.id, { label = "Inbound bytes" }],
            ["AWS/EC2", "NetworkOut", "InstanceId", aws_instance.database.id, { label = "Outbound bytes" }],
          ]
          period = 300
          region = var.aws_region
          stat   = "Sum"
          title  = "Shared-host network traffic"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 16
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/EBS", "VolumeReadOps", "VolumeId", aws_ebs_volume.data_canonical.id, { label = "Read operations", stat = "Sum" }],
            ["AWS/EBS", "VolumeWriteOps", "VolumeId", aws_ebs_volume.data_canonical.id, { label = "Write operations", stat = "Sum" }],
            ["AWS/EBS", "VolumeQueueLength", "VolumeId", aws_ebs_volume.data_canonical.id, { label = "Queue length", stat = "Average", yAxis = "right" }],
          ]
          period = 60
          region = var.aws_region
          title  = "Canonical OSM data volume"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 16
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/EBS", "VolumeReadOps", "VolumeId", local.routing_graph_volume_id, { label = "Read operations", stat = "Sum" }],
            ["AWS/EBS", "VolumeWriteOps", "VolumeId", local.routing_graph_volume_id, { label = "Write operations", stat = "Sum" }],
            ["AWS/EBS", "VolumeQueueLength", "VolumeId", local.routing_graph_volume_id, { label = "Queue length", stat = "Average", yAxis = "right" }],
          ]
          period = 60
          region = var.aws_region
          title  = "Canonical GraphHopper volume"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 22
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
          ]
          period = 60
          region = var.aws_region
          stat   = "Maximum"
          title  = "Minute replication"
          view   = "timeSeries"
          legend = {
            position = "right"
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 22
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["DAF/OSM", "CurrentAlprNodeCount", "InstanceId", aws_instance.database.id, { label = "Current ALPR nodes" }],
            ["DAF/OSM", "HistoryEventCount", "InstanceId", aws_instance.database.id, { label = "History events" }],
            ["DAF/OSM", "SharedFeedSequence", "InstanceId", aws_instance.database.id, { label = "Shared sequence", yAxis = "right" }],
            ["DAF/OSM", "CurrentConsumerSequence", "InstanceId", aws_instance.database.id, { label = "Current sequence", yAxis = "right" }],
            ["DAF/OSM", "HistoryConsumerSequence", "InstanceId", aws_instance.database.id, { label = "History sequence", yAxis = "right" }],
          ]
          period  = 60
          region  = var.aws_region
          stat    = "Maximum"
          stacked = false
          title   = "Publication and history volume"
          view    = "bar"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 28
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
        type   = "metric"
        x      = 12
        y      = 28
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["DAF/Routing", "ServingMemoryUsedPercent", "InstanceId", aws_instance.database.id, { label = "Shared-host memory used (%)" }],
            ["DAF/Routing", "ServingGraphVolumeUsedPercent", "InstanceId", aws_instance.database.id, { label = "Graph volume used (%)" }],
          ]
          period = 60
          region = var.aws_region
          stat   = "Average"
          title  = "GraphHopper serving capacity"
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
        x      = 0
        y      = 34
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
        y      = 34
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/NATGateway", "ActiveConnectionCount", "NatGatewayId", data.aws_nat_gateway.routing.id, { label = "Active connections" }],
            ["AWS/NATGateway", "ErrorPortAllocation", "NatGatewayId", data.aws_nat_gateway.routing.id, { label = "Port allocation errors", stat = "Sum", yAxis = "right" }],
            ["AWS/NATGateway", "PacketsDropCount", "NatGatewayId", data.aws_nat_gateway.routing.id, { label = "Dropped packets", stat = "Sum", yAxis = "right" }],
          ]
          period = 300
          region = var.aws_region
          stat   = "Average"
          title  = "Shared NAT health"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 40
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/S3", "BucketSizeBytes", "BucketName", data.terraform_remote_state.routing.outputs.graph_artifact_bucket, "StorageType", "StandardStorage", { label = "Graph artifact storage" }],
            ["AWS/S3", "NumberOfObjects", "BucketName", data.terraform_remote_state.routing.outputs.graph_artifact_bucket, "StorageType", "AllStorageTypes", { label = "Artifact objects", yAxis = "right" }],
            ["AWS/S3", "BucketSizeBytes", "BucketName", aws_s3_bucket.backups.id, "StorageType", "StandardStorage", { label = "PostgreSQL backup storage" }],
            ["AWS/S3", "NumberOfObjects", "BucketName", aws_s3_bucket.backups.id, "StorageType", "AllStorageTypes", { label = "Backup objects", yAxis = "right" }],
          ]
          period = 86400
          region = var.aws_region
          stat   = "Average"
          title  = "Disaster-recovery storage (daily)"
          view   = "timeSeries"
        }
      },
      {
        type   = "text"
        x      = 12
        y      = 40
        width  = 12
        height = 6
        properties = {
          markdown = <<-MARKDOWN
            ## Cost controls

            - Whole DAF stack monthly budget: **$150**
            - Scope: `Project=daf-osm` and `Project=daf-routing`
            - Actual alerts: **$75** and **$125**
            - Forecast alert: **100%** of the monthly budget
            - OSM anomaly alert: at least **$10** and **20%** impact
            - S3 graph artifacts and PostgreSQL backups are disaster-recovery fallbacks

            Budget and anomaly data can have normal AWS billing and model-evaluation delay.
          MARKDOWN
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 46
        width  = 24
        height = 7
        properties = {
          query  = "SOURCE '${aws_cloudwatch_log_group.database.name}' | SOURCE '/daf-routing/serving' | SOURCE '/daf-routing/builder' | fields @timestamp, @message, @log, @logStream, service, role, event, active_state, sub_state, result, exit_code, restart_count, replication_sequence, lag_seconds, backup_age_seconds, release_id, phase, percent, detail | filter @message not like /^(BEGIN|COMMIT|TRUNCATE TABLE|INSERT [0-9]+ [0-9]+|UPDATE [0-9]+)$/ | sort @timestamp desc | limit 50"
          region = var.aws_region
          title  = "Recent OSM, GraphHopper, and builder logs"
          view   = "table"
        }
      },
    ]
  })
}
