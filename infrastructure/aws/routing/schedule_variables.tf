variable "graph_build_schedule_enabled" {
  description = "Whether the biweekly GraphHopper graph build schedule is enabled."
  type        = bool
  default     = true
}

variable "graph_build_schedule_expression" {
  description = "EventBridge Scheduler cron or rate expression for GraphHopper graph builds."
  type        = string
  default     = "rate(14 days)"

  validation {
    condition     = can(regex("^(cron\\(.+\\)|rate\\([1-9][0-9]* (minute|minutes|hour|hours|day|days)\\))$", var.graph_build_schedule_expression))
    error_message = "graph_build_schedule_expression must be an EventBridge Scheduler cron or rate expression."
  }
}

variable "graph_build_schedule_start_date" {
  description = "UTC start date anchoring the 14-day interval to Sunday at 07:00 UTC, two weeks after the last weekly build."
  type        = string
  default     = "2026-10-11T07:00:00Z"

  validation {
    condition     = can(formatdate("YYYY-MM-DD'T'hh:mm:ssZ", var.graph_build_schedule_start_date))
    error_message = "graph_build_schedule_start_date must be an RFC 3339 timestamp."
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
