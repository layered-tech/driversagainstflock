moved {
  from = aws_ebs_volume.graphs_compact
  to   = aws_ebs_volume.graphs
}

moved {
  from = aws_volume_attachment.graphs_compact
  to   = aws_volume_attachment.graphs
}
