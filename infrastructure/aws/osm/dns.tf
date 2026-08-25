resource "aws_route53_zone" "private" {
  name = local.private_zone_name

  vpc {
    vpc_id     = data.aws_vpc.production.id
    vpc_region = var.aws_region
  }

  tags = {
    Name = "daf-osm-private"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_route53_record" "database" {
  zone_id = aws_route53_zone.private.zone_id
  name    = local.database_dns_name
  type    = "A"
  ttl     = 60
  records = [var.database_private_ip]
}
