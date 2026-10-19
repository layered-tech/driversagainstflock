locals {
  graph_build_operation_objects = merge({
    build = {
      content_type = "text/x-shellscript"
      key          = "operations/build/v1.3.0/build-initial-graph.sh"
      source       = "operations/build/v1.3.0/build-initial-graph.sh"
    }
    deploy = {
      content_type = "text/x-shellscript"
      key          = "operations/serving/v1.1.0/deploy-graph.sh"
      source       = "operations/serving/v1.1.0/deploy-graph.sh"
    }
    logging = {
      content_type = "text/x-shellscript"
      key          = "operations/logging/v1.0.0/install-cloudwatch-logs.sh"
      source       = "operations/logging/v1.0.0/install-cloudwatch-logs.sh"
    }
    scheduled_builder = {
      content_type = "text/x-shellscript"
      key          = "operations/scheduled-builder/v1.1.0/run-build.sh"
      source       = "operations/scheduled-builder/v1.1.0/run-build.sh"
    }
    }, {
    for name in ["assets.json", "run-corridor.sh", "publish-and-promote.mjs", "validate-road-corridor.mjs", "road-corridor-contract.mjs", "RoadCorridorExporter.java"] : "corridor_${name}" => {
      content_type = endswith(name, ".json") ? "application/json" : "text/plain"
      key          = "operations/corridor/v1.0.0/${name}"
      source       = "operations/corridor/v1.0.0/${name}"
    }
  })
}

resource "aws_s3_object" "graph_build_operation" {
  for_each = local.graph_build_operation_objects

  bucket                 = aws_s3_bucket.graphs.id
  key                    = each.value.key
  source                 = "${path.module}/${each.value.source}"
  source_hash            = filesha256("${path.module}/${each.value.source}")
  content_type           = each.value.content_type
  server_side_encryption = "AES256"

  metadata = {
    sha256 = filesha256("${path.module}/${each.value.source}")
  }

  depends_on = [
    aws_s3_bucket_server_side_encryption_configuration.graphs,
    aws_s3_bucket_versioning.graphs,
  ]
}
