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

resource "aws_budgets_budget" "monthly" {
  name         = "daf-routing-monthly"
  budget_type  = "COST"
  limit_amount = "350"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["Project\u0024daf-routing"]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 275
    threshold_type            = "ABSOLUTE_VALUE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 350
    threshold_type            = "ABSOLUTE_VALUE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  tags = {
    Name = "daf-routing-monthly"
  }

  depends_on = [aws_sns_topic_policy.alerts]
}
