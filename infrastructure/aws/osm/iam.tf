data "aws_iam_policy_document" "database_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "database" {
  statement {
    sid    = "SystemsManagerManagedInstance"
    effect = "Allow"
    actions = [
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
    resources = ["*"]
  }

  statement {
    sid     = "ReadOsmParameters"
    effect  = "Allow"
    actions = ["ssm:GetParameter"]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/daf-osm/database/endpoint",
      "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/daf-osm/database/name",
      "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/daf-osm/database/port",
      "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/daf-osm/database/publisher-password",
    ]
  }

  statement {
    sid     = "PublishOsmDatabaseParameters"
    effect  = "Allow"
    actions = ["ssm:PutParameter"]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/daf-osm/database/publisher-password",
      "arn:aws:ssm:${var.aws_region}:${var.aws_account_id}:parameter/daf-osm/database/publisher-username",
    ]
  }

  statement {
    sid       = "ListBootstrapArtifact"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [local.artifact_bucket_arn]

    condition {
      test     = "StringEquals"
      variable = "s3:prefix"
      values   = [var.bootstrap_artifact_key]
    }
  }

  statement {
    sid       = "ReadBootstrapArtifact"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${local.artifact_bucket_arn}/${var.bootstrap_artifact_key}"]
  }

  statement {
    sid       = "ListPostgresqlBackups"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [local.backup_bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${trimsuffix(var.backup_prefix, "/")}/*"]
    }
  }

  statement {
    sid       = "ListPostgresqlBackupUploads"
    effect    = "Allow"
    actions   = ["s3:ListBucketMultipartUploads"]
    resources = [local.backup_bucket_arn]
  }

  statement {
    sid    = "ManagePostgresqlBackupObjects"
    effect = "Allow"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:GetObject",
      "s3:ListMultipartUploadParts",
      "s3:PutObject",
    ]
    resources = ["${local.backup_bucket_arn}/${trimsuffix(var.backup_prefix, "/")}/*"]
  }

  statement {
    sid    = "WriteOsmLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:DescribeLogStreams",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.database.arn}:*"]
  }

  statement {
    sid       = "WriteOsmMetrics"
    effect    = "Allow"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["DAF/OSM"]
    }
  }
}

resource "aws_iam_role" "database" {
  name                 = "daf-osm-database"
  description          = "Runtime role for the private OSM PostgreSQL and osm2pgsql instance"
  assume_role_policy   = data.aws_iam_policy_document.database_assume_role.json
  permissions_boundary = "arn:aws:iam::${var.aws_account_id}:policy/DafOsmWorkloadBoundary"

  tags = merge(local.common_tags, {
    Name = "daf-osm-database"
  })
}

resource "aws_iam_role_policy" "database" {
  name   = "daf-osm-database-runtime"
  role   = aws_iam_role.database.id
  policy = data.aws_iam_policy_document.database.json
}

resource "aws_iam_instance_profile" "database" {
  name = "daf-osm-database"
  role = aws_iam_role.database.name

  tags = merge(local.common_tags, {
    Name = "daf-osm-database"
  })
}
