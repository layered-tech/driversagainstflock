output "graph_build_schedule_arn" {
  description = "ARN of the weekly GraphHopper graph build schedule."
  value       = aws_scheduler_schedule.graph_build.arn
}

output "graph_build_scheduler_dlq_arn" {
  description = "ARN of the dead-letter queue for failed graph build launches."
  value       = aws_sqs_queue.graph_build_scheduler_dlq.arn
}
