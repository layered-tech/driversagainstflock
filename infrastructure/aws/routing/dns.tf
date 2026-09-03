resource "aws_route53_zone" "private" {
  name = local.private_zone_name

  vpc {
    vpc_id     = data.aws_vpc.production.id
    vpc_region = var.aws_region
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name = "daf-routing-private"
  }
}

resource "aws_route53_record" "graphhopper" {
  zone_id = aws_route53_zone.private.zone_id
  name    = local.graphhopper_dns_name
  type    = "A"
  ttl     = 60
  records = [local.graphhopper_private_ip]
}
