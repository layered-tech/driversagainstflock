resource "aws_subnet" "routing_private" {
  vpc_id                  = data.aws_vpc.production.id
  cidr_block              = var.private_subnet_cidr
  availability_zone       = data.aws_subnet.public.availability_zone
  map_public_ip_on_launch = false

  tags = {
    Name = "daf-routing-private-${data.aws_subnet.public.availability_zone}"
  }
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "daf-routing-nat"
  }
}

resource "aws_nat_gateway" "routing" {
  allocation_id = aws_eip.nat.id
  subnet_id     = data.aws_subnet.public.id

  tags = {
    Name = "daf-routing"
  }
}

resource "aws_route_table" "routing_private" {
  vpc_id = data.aws_vpc.production.id

  tags = {
    Name = "daf-routing-private"
  }
}

resource "aws_route" "routing_private_internet" {
  route_table_id         = aws_route_table.routing_private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.routing.id
}

resource "aws_route_table_association" "routing_private" {
  subnet_id      = aws_subnet.routing_private.id
  route_table_id = aws_route_table.routing_private.id
}

resource "aws_security_group" "serving" {
  name        = "daf-routing-serving"
  description = "GraphHopper ingress from the existing Laravel security group only"
  vpc_id      = data.aws_vpc.production.id

  tags = {
    Name = "daf-routing-serving"
  }
}

resource "aws_security_group_rule" "serving_from_laravel" {
  type                     = "ingress"
  security_group_id        = aws_security_group.serving.id
  source_security_group_id = data.aws_security_group.laravel.id
  description              = "GraphHopper API from Laravel"
  from_port                = 8080
  to_port                  = 8080
  protocol                 = "tcp"
}

resource "aws_security_group_rule" "serving_ipv4" {
  type              = "egress"
  security_group_id = aws_security_group.serving.id
  description       = "Package, SSM, telemetry, and artifact access through NAT"
  cidr_blocks       = ["0.0.0.0/0"]
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
}

resource "aws_security_group" "builder" {
  name        = "daf-routing-builder"
  description = "No-ingress security group for on-demand GraphHopper builders"
  vpc_id      = data.aws_vpc.production.id

  tags = {
    Name = "daf-routing-builder"
  }
}

resource "aws_security_group_rule" "builder_ipv4" {
  type              = "egress"
  security_group_id = aws_security_group.builder.id
  description       = "Build downloads, SSM, telemetry, and artifact uploads through NAT"
  cidr_blocks       = ["0.0.0.0/0"]
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
}
