variable "graph_build_schedule_enabled" {
  description = "Whether the weekly GraphHopper graph build schedule is enabled."
  type        = bool
  default     = true
}

variable "graph_build_schedule_expression" {
  description = "EventBridge Scheduler cron expression for GraphHopper graph builds."
  type        = string
  default     = "cron(15 15 ? * SUN *)"

  validation {
    condition     = can(regex("^cron\\(.+\\)$", var.graph_build_schedule_expression))
    error_message = "graph_build_schedule_expression must be an EventBridge Scheduler cron expression."
  }
}

variable "graph_build_schedule_timezone" {
  description = "IANA timezone used to evaluate the GraphHopper graph build schedule."
  type        = string
  default     = "America/Chicago"

  validation {
    condition     = length(trimspace(var.graph_build_schedule_timezone)) > 0
    error_message = "graph_build_schedule_timezone must not be empty."
  }
}
