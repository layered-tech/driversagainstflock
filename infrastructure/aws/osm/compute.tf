resource "aws_network_interface" "database" {
  subnet_id       = aws_subnet.private.id
  private_ips     = [var.database_private_ip]
  security_groups = [aws_security_group.database.id]

  tags = {
    Name = "daf-osm-database"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_instance" "database" {
  ami                                  = data.aws_ssm_parameter.amazon_linux_arm64.value
  instance_type                        = var.database_instance_type
  iam_instance_profile                 = aws_iam_instance_profile.database.name
  ebs_optimized                        = true
  monitoring                           = true
  disable_api_termination              = true
  instance_initiated_shutdown_behavior = "stop"
  user_data_replace_on_change          = false

  user_data = base64encode(templatefile("${path.module}/operations/user-data.sh", {
    artifacts_bucket                  = aws_s3_bucket.artifacts.id
    artifacts_key                     = var.bootstrap_artifact_key
    artifacts_sha256                  = local.bootstrap_artifact_sha256
    aws_region                        = var.aws_region
    backup_bucket                     = aws_s3_bucket.backups.id
    backup_prefix                     = var.backup_prefix
    cloudwatch_namespace              = local.cloudwatch_namespace
    data_device                       = var.data_device
    data_mount_path                   = var.data_mount_path
    database_client_cidr              = "${data.aws_instance.laravel.private_ip}/32"
    database_name                     = var.database_name
    database_parameter_name           = local.database_name_parameter_name
    endpoint_parameter_name           = local.database_endpoint_parameter_name
    postgresql_port                   = var.database_port
    port_parameter_name               = local.database_port_parameter_name
    publisher_password_parameter_name = local.publisher_password_parameter_name
    publisher_username_parameter_name = local.publisher_username_parameter_name
  }))

  network_interface {
    network_interface_id = aws_network_interface.database.id
    device_index         = 0
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_protocol_ipv6          = "disabled"
    http_put_response_hop_limit = 1
    http_tokens                 = "required"
    instance_metadata_tags      = "disabled"
  }

  root_block_device {
    delete_on_termination = true
    encrypted             = true
    iops                  = 3000
    throughput            = 125
    volume_size           = var.root_volume_size_gib
    volume_type           = "gp3"

    tags = merge(local.common_tags, {
      Name = "daf-osm-database-root"
    })
  }

  tags = {
    Name = "daf-osm-database"
  }

  depends_on = [
    aws_route.private_internet,
    aws_route53_record.database,
    aws_s3_object.bootstrap,
    aws_ssm_parameter.database_endpoint,
    aws_ssm_parameter.database_name,
    aws_ssm_parameter.database_port,
    aws_vpc_endpoint.s3,
  ]

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [ami, user_data]
  }
}

resource "aws_volume_attachment" "data" {
  device_name                    = var.data_device
  volume_id                      = aws_ebs_volume.data.id
  instance_id                    = aws_instance.database.id
  force_detach                   = false
  stop_instance_before_detaching = true
}
