resource "aws_launch_template" "builder" {
  name                                 = "daf-routing-builder"
  description                          = "Manual and scheduled ARM GraphHopper graph builder"
  instance_initiated_shutdown_behavior = "terminate"
  update_default_version               = true

  image_id      = data.aws_ssm_parameter.amazon_linux_2023_arm64.value
  instance_type = var.builder_instance_type

  user_data = base64encode(file("${path.module}/operations/scheduled-builder-user-data.sh"))

  iam_instance_profile {
    name = aws_iam_instance_profile.builder.name
  }

  network_interfaces {
    associate_public_ip_address = false
    delete_on_termination       = true
    device_index                = 0
    security_groups             = [aws_security_group.builder.id]
    subnet_id                   = aws_subnet.routing_private.id
  }

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      delete_on_termination = true
      encrypted             = true
      iops                  = 3000
      throughput            = 125
      volume_size           = 30
      volume_type           = "gp3"
    }
  }

  block_device_mappings {
    device_name = "/dev/sdf"

    ebs {
      delete_on_termination = true
      encrypted             = true
      iops                  = 3000
      throughput            = 250
      volume_size           = 768
      volume_type           = "gp3"
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_protocol_ipv6          = "disabled"
    http_put_response_hop_limit = 1
    http_tokens                 = "required"
    instance_metadata_tags      = "disabled"
  }

  monitoring {
    enabled = true
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(local.common_tags, {
      Name = "daf-routing-builder"
    })
  }

  tag_specifications {
    resource_type = "volume"
    tags = merge(local.common_tags, {
      Name = "daf-routing-builder-volume"
    })
  }

  tag_specifications {
    resource_type = "network-interface"
    tags = merge(local.common_tags, {
      Name = "daf-routing-builder"
    })
  }

  tags = {
    Name = "daf-routing-builder"
  }
}
