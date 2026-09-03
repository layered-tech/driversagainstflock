resource "aws_budgets_budget" "monthly" {
  name             = "daf-osm-monthly"
  billing_view_arn = "arn:aws:billing::${var.aws_account_id}:billingview/primary"
  budget_type      = "COST"
  limit_amount     = "150"
  limit_unit       = "USD"
  time_unit        = "MONTHLY"
  metrics          = ["UnblendedCost"]

  filter_expression {
    tags {
      key    = "Project"
      values = ["daf-osm", "daf-routing"]
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
