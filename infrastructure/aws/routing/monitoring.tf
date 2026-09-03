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
