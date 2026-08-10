data "aws_vpc" "production" {
  id = var.vpc_id
}

data "aws_subnet" "public" {
  id = var.public_subnet_id
}

data "aws_route_table" "public" {
  route_table_id = var.public_route_table_id
}

data "aws_instance" "laravel" {
  instance_id = var.laravel_instance_id
}

data "aws_security_group" "laravel" {
  id = var.laravel_security_group_id
}

data "aws_ssm_parameter" "amazon_linux_2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

check "protected_public_topology" {
  assert {
    condition = (
      data.aws_subnet.public.vpc_id == data.aws_vpc.production.id &&
      data.aws_route_table.public.vpc_id == data.aws_vpc.production.id &&
      data.aws_instance.laravel.subnet_id == data.aws_subnet.public.id &&
      data.aws_security_group.laravel.vpc_id == data.aws_vpc.production.id &&
      contains(data.aws_instance.laravel.vpc_security_group_ids, data.aws_security_group.laravel.id)
    )
    error_message = "The protected production VPC, subnet, Laravel instance, route table, or security group no longer matches the approved topology."
  }

  assert {
    condition = anytrue([
      for route in data.aws_route_table.public.routes :
      route.cidr_block == "0.0.0.0/0" && route.gateway_id == var.internet_gateway_id
    ])
    error_message = "The protected public route table no longer sends IPv4 internet traffic through the approved internet gateway."
  }
}
