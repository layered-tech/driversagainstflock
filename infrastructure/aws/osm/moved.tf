moved {
  from = aws_ebs_volume.data
  to   = aws_ebs_volume.data_legacy
}

moved {
  from = aws_volume_attachment.data
  to   = aws_volume_attachment.data_legacy[0]
}
