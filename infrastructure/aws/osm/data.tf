data "terraform_remote_state" "routing" {
  backend = "s3"

  config = {
    bucket              = var.routing_state_bucket
    key                 = var.routing_state_key
    region              = var.aws_region
    profile             = var.aws_profile
    encrypt             = true
    use_lockfile        = true
    allowed_account_ids = [var.aws_account_id]
  }
}

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

data "aws_subnet" "routing_private" {
  id = data.terraform_remote_state.routing.outputs.private_subnet_id
}

data "aws_nat_gateway" "routing" {
  id = data.terraform_remote_state.routing.outputs.nat_gateway_id
}

data "aws_ssm_parameter" "amazon_linux_arm64" {
  name = var.amazon_linux_arm64_parameter_name
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

check "protected_routing_egress" {
  assert {
    condition = (
      data.aws_subnet.routing_private.vpc_id == data.aws_vpc.production.id &&
      data.aws_subnet.routing_private.cidr_block == "10.0.2.0/24" &&
      data.aws_nat_gateway.routing.vpc_id == data.aws_vpc.production.id &&
      data.aws_nat_gateway.routing.subnet_id == data.aws_subnet.public.id &&
      data.aws_nat_gateway.routing.state == "available" &&
      data.aws_nat_gateway.routing.connectivity_type == "public"
    )
    error_message = "The shared daf-routing private subnet or NAT gateway no longer matches the approved topology."
  }
}
