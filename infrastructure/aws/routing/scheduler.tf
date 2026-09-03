locals {
  graph_build_dlq_name           = "daf-routing-graph-build-scheduler-dlq"
  graph_build_schedule_group_arn = "arn:aws:scheduler:${var.aws_region}:${var.aws_account_id}:schedule-group/default"
  graph_build_schedule_name      = "daf-routing-weekly-graph-build"
}

resource "aws_sqs_queue" "graph_build_scheduler_dlq" {
  name                      = local.graph_build_dlq_name
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true

  tags = {
    Name = local.graph_build_dlq_name
  }
}

data "aws_iam_policy_document" "scheduler_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [local.graph_build_schedule_group_arn]
    }
  }
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    sid       = "LaunchReviewedBuilderTemplate"
    effect    = "Allow"
    actions   = ["ec2:RunInstances"]
    resources = ["*"]

    condition {
      test     = "ArnLike"
      variable = "ec2:LaunchTemplate"
      values   = [aws_launch_template.builder.arn]
    }

    condition {
      test     = "Bool"
      variable = "ec2:IsLaunchTemplateResource"
      values   = ["true"]
    }
  }

  statement {
    sid     = "TagBuilderResourcesAtLaunch"
    effect  = "Allow"
    actions = ["ec2:CreateTags"]
    resources = [
      "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:instance/*",
      "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:network-interface/*",
      "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:volume/*",
    ]

    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values   = ["RunInstances"]
    }
  }

  statement {
    sid       = "PassBuilderRoleOnlyToEc2"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.builder.arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ec2.amazonaws.com"]
    }
  }

  statement {
    sid       = "SendSchedulerFailuresToDlq"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.graph_build_scheduler_dlq.arn]
  }
}

resource "aws_iam_role" "scheduler" {
  name                 = "daf-routing-graph-build-scheduler"
  description          = "Launches the reviewed private GraphHopper builder from EventBridge Scheduler"
  assume_role_policy   = data.aws_iam_policy_document.scheduler_assume_role.json
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/DafRoutingWorkloadBoundary"

  tags = {
    Name = "daf-routing-graph-build-scheduler"
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "daf-routing-graph-build-scheduler"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

data "aws_iam_policy_document" "builder_automation" {
  statement {
    sid       = "ReadServingState"
    effect    = "Allow"
    actions   = ["ec2:DescribeInstances", "ssm:DescribeInstanceInformation", "ssm:GetCommandInvocation"]
    resources = ["*"]
  }

  statement {
    sid     = "RunReviewedServingOperation"
    effect  = "Allow"
    actions = ["ssm:SendCommand"]
    resources = [
      "arn:aws:ec2:${var.aws_region}:${var.aws_account_id}:instance/${var.shared_serving_instance_id}",
      "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript",
    ]
  }

  statement {
    sid       = "UpdateActiveGraphPointer"
    effect    = "Allow"
    actions   = ["ssm:PutParameter"]
    resources = [aws_ssm_parameter.graph_artifact_prefix.arn]
  }

  statement {
    sid       = "PublishGraphAutomationFailures"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
  }
}

resource "aws_iam_role_policy" "builder_automation" {
  name   = "daf-routing-builder-automation"
  role   = aws_iam_role.builder.id
  policy = data.aws_iam_policy_document.builder_automation.json
}

resource "aws_scheduler_schedule" "graph_build" {
  name                         = local.graph_build_schedule_name
  description                  = "Build and deploy the U.S. GraphHopper graph on the configured weekly schedule"
  schedule_expression          = var.graph_build_schedule_expression
  schedule_expression_timezone = var.graph_build_schedule_timezone
  state                        = var.graph_build_schedule_enabled ? "ENABLED" : "DISABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ec2:runInstances"
    role_arn = aws_iam_role.scheduler.arn
    input = replace(jsonencode({
      ClientToken = "<aws.scheduler.scheduled-time>"
      LaunchTemplate = {
        LaunchTemplateId = aws_launch_template.builder.id
        Version          = "$Default"
      }
      MaxCount = 1
      MinCount = 1
    }), "\\u003caws.scheduler.scheduled-time\\u003e", "<aws.scheduler.scheduled-time>")

    dead_letter_config {
      arn = aws_sqs_queue.graph_build_scheduler_dlq.arn
    }

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }

  depends_on = [aws_s3_object.graph_build_operation]
}

resource "aws_cloudwatch_metric_alarm" "graph_build_scheduler_dlq" {
  lifecycle {
    create_before_destroy = true
  }

  alarm_name          = "daf-infrastructure-routing-graph-build-scheduler-failures"
  alarm_description   = "EventBridge Scheduler exhausted retries for a graph build launch"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    QueueName = aws_sqs_queue.graph_build_scheduler_dlq.name
  }

  tags = {
    Name = "daf-infrastructure-routing-graph-build-scheduler-failures"
  }
}
