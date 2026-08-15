resource "aws_network_interface" "serving" {
  subnet_id       = aws_subnet.routing_private.id
  private_ips     = [var.serving_private_ip]
  security_groups = [aws_security_group.serving.id]

  tags = {
    Name = "daf-routing-serving"
  }
}

resource "aws_instance" "serving" {
  ami                                  = data.aws_ssm_parameter.amazon_linux_2023_arm64.value
  instance_type                        = var.serving_instance_type
  iam_instance_profile                 = aws_iam_instance_profile.serving.name
  monitoring                           = true
  disable_api_termination              = true
  instance_initiated_shutdown_behavior = "stop"

  network_interface {
    network_interface_id = aws_network_interface.serving.id
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
    volume_size           = 30
    volume_type           = "gp3"

    tags = merge(local.common_tags, {
      Name = "daf-routing-serving-root"
    })
  }

  tags = {
    Name = "daf-routing-serving"
  }

  depends_on = [aws_route.routing_private_internet]
}

resource "aws_volume_attachment" "graphs" {
  device_name = "/dev/sdg"
  volume_id   = aws_ebs_volume.graphs.id
  instance_id = aws_instance.serving.id
}

resource "aws_launch_template" "builder" {
  name                   = "daf-routing-builder"
  description            = "On-demand 128-GiB ARM GraphHopper graph builder"
  update_default_version = true

  image_id      = data.aws_ssm_parameter.amazon_linux_2023_arm64.value
  instance_type = var.builder_instance_type

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
      Name = "daf-routing-builder-root"
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
