resource "aws_subnet" "private" {
  vpc_id                  = data.aws_vpc.production.id
  cidr_block              = var.private_subnet_cidr
  availability_zone       = data.aws_subnet.public.availability_zone
  map_public_ip_on_launch = false

  tags = {
    Name = "daf-osm-private-${data.aws_subnet.public.availability_zone}"
  }
}

resource "aws_route_table" "private" {
  vpc_id = data.aws_vpc.production.id

  tags = {
    Name = "daf-osm-private"
  }
}

resource "aws_route" "private_internet" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = data.aws_nat_gateway.routing.id
}

resource "aws_route_table_association" "private" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private.id
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = data.aws_vpc.production.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]

  tags = {
    Name = "daf-osm-s3"
  }
}

resource "aws_security_group" "database" {
  name        = "daf-osm-database"
  description = "PostgreSQL ingress from the protected Moonlit Laravel security group only"
  vpc_id      = data.aws_vpc.production.id

  tags = {
    Name = "daf-osm-database"
  }
}

resource "aws_security_group_rule" "database_from_laravel" {
  type                     = "ingress"
  security_group_id        = aws_security_group.database.id
  source_security_group_id = data.aws_security_group.laravel.id
  description              = "PostgreSQL from Moonlit Laravel"
  from_port                = var.database_port
  to_port                  = var.database_port
  protocol                 = "tcp"
}

resource "aws_security_group_rule" "database_ipv4" {
  type              = "egress"
  security_group_id = aws_security_group.database.id
  description       = "Package, OSM replication, SSM, telemetry, artifact, and backup access"
  cidr_blocks       = ["0.0.0.0/0"]
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
}
