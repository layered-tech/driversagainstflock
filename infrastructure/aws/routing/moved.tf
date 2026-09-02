moved {
  from = aws_ebs_volume.graphs_compact
  to   = aws_ebs_volume.graphs
}

moved {
  from = aws_ebs_volume.graphs
  to   = aws_ebs_volume.graph_legacy
}

moved {
  from = aws_volume_attachment.graphs_compact
  to   = aws_volume_attachment.graphs
}

moved {
  from = aws_volume_attachment.graphs
  to   = aws_volume_attachment.graph_legacy[0]
}
