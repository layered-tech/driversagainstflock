resource "aws_s3_bucket" "graphs" {
  bucket        = local.graph_bucket_name
  force_destroy = false

  tags = {
    Name = "daf-routing-graphs"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_ownership_controls" "graphs" {
  bucket = aws_s3_bucket.graphs.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "graphs" {
  bucket = aws_s3_bucket.graphs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "graphs" {
  bucket = aws_s3_bucket.graphs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "graphs" {
  bucket = aws_s3_bucket.graphs.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "graphs" {
  bucket = aws_s3_bucket.graphs.id

  rule {
    id     = "retain-current-and-previous-graphs"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    noncurrent_version_expiration {
      newer_noncurrent_versions = 1
      noncurrent_days           = 30
    }
  }

  depends_on = [aws_s3_bucket_versioning.graphs]
}

data "aws_iam_policy_document" "graphs" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]
    resources = [
      local.graph_bucket_arn,
      "${local.graph_bucket_arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "graphs" {
  bucket = aws_s3_bucket.graphs.id
  policy = data.aws_iam_policy_document.graphs.json

  depends_on = [aws_s3_bucket_public_access_block.graphs]
}

resource "aws_ebs_volume" "graph_legacy" {
  availability_zone = data.aws_subnet.public.availability_zone
  size              = 128
  type              = "gp3"
  iops              = 3000
  throughput        = 250
  encrypted         = true

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name = "daf-routing-graphs"
  }
}

resource "aws_ebs_volume" "graph_canonical" {
  availability_zone = data.aws_subnet.public.availability_zone
  encrypted         = true
  iops              = 3000
  size              = var.graph_volume_size_gib
  throughput        = 125
  type              = "gp3"

  tags = {
    Name = "daf-routing-graphs-canonical"
  }

  lifecycle {
    prevent_destroy = true
  }
}
