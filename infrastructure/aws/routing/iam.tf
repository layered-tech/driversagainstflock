data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

locals {
  ssm_managed_instance_actions = [
    "ec2messages:AcknowledgeMessage",
    "ec2messages:DeleteMessage",
    "ec2messages:FailMessage",
    "ec2messages:GetEndpoint",
    "ec2messages:GetMessages",
    "ec2messages:SendReply",
    "ssm:DescribeAssociation",
    "ssm:DescribeDocument",
    "ssm:GetDeployablePatchSnapshotForInstance",
    "ssm:GetDocument",
    "ssm:GetManifest",
    "ssm:ListAssociations",
    "ssm:ListInstanceAssociations",
    "ssm:PutComplianceItems",
    "ssm:PutConfigurePackageResult",
    "ssm:PutInventory",
    "ssm:UpdateAssociationStatus",
    "ssm:UpdateInstanceAssociationStatus",
    "ssm:UpdateInstanceInformation",
    "ssmmessages:CreateControlChannel",
    "ssmmessages:CreateDataChannel",
    "ssmmessages:OpenControlChannel",
    "ssmmessages:OpenDataChannel",
  ]
}

data "aws_iam_policy_document" "serving" {
  statement {
    sid       = "SystemsManagerManagedInstance"
    effect    = "Allow"
    actions   = local.ssm_managed_instance_actions
    resources = ["*"]
  }

  statement {
    sid       = "ReadRoutingParameters"
    effect    = "Allow"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/daf-routing/*"]
  }

  statement {
    sid       = "ListGraphArtifacts"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [local.graph_bucket_arn]
  }

  statement {
    sid       = "ReadGraphArtifacts"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${local.graph_bucket_arn}/*"]
  }

  statement {
    sid       = "WriteRoutingLogs"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:DescribeLogStreams", "logs:PutLogEvents"]
    resources = ["${local.serving_log_group_arn}:*"]
  }

  statement {
    sid       = "WriteRoutingMetrics"
    effect    = "Allow"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["DAF/Routing"]
    }
  }
}

data "aws_iam_policy_document" "builder" {
  source_policy_documents = [data.aws_iam_policy_document.serving.json]

  statement {
    sid       = "WriteRoutingLogs"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:DescribeLogStreams", "logs:PutLogEvents"]
    resources = ["${local.builder_log_group_arn}:*"]
  }

  statement {
    sid       = "WriteGraphArtifacts"
    effect    = "Allow"
    actions   = ["s3:AbortMultipartUpload", "s3:ListMultipartUploadParts", "s3:PutObject"]
    resources = ["${local.graph_bucket_arn}/*"]
  }
}

resource "aws_iam_role" "serving" {
  name                 = "daf-routing-serving"
  description          = "GraphHopper serving instance workload role"
  assume_role_policy   = data.aws_iam_policy_document.ec2_assume_role.json
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/DafRoutingWorkloadBoundary"

  tags = {
    Name = "daf-routing-serving"
  }
}

resource "aws_iam_role_policy" "serving" {
  name   = "daf-routing-serving"
  role   = aws_iam_role.serving.id
  policy = data.aws_iam_policy_document.serving.json
}

resource "aws_iam_instance_profile" "serving" {
  name = "daf-routing-serving"
  role = aws_iam_role.serving.name

  tags = {
    Name = "daf-routing-serving"
  }
}

resource "aws_iam_role" "builder" {
  name                 = "daf-routing-builder"
  description          = "On-demand GraphHopper graph builder workload role"
  assume_role_policy   = data.aws_iam_policy_document.ec2_assume_role.json
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/DafRoutingWorkloadBoundary"

  tags = {
    Name = "daf-routing-builder"
  }
}

resource "aws_iam_role_policy" "builder" {
  name   = "daf-routing-builder"
  role   = aws_iam_role.builder.id
  policy = data.aws_iam_policy_document.builder.json
}

resource "aws_iam_instance_profile" "builder" {
  name = "daf-routing-builder"
  role = aws_iam_role.builder.name

  tags = {
    Name = "daf-routing-builder"
  }
}
