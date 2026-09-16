resource "google_monitoring_notification_channel" "operator" {
  count        = var.alert_email == "" ? 0 : 1
  display_name = "AutoReview operator"
  type         = "email"
  labels       = { email_address = var.alert_email }
  depends_on   = [google_project_service.required]
}

resource "google_monitoring_alert_policy" "service_errors" {
  display_name          = "${local.name}: API or worker server errors"
  combiner              = "OR"
  notification_channels = google_monitoring_notification_channel.operator[*].name
  conditions {
    display_name = "At least ten server errors in a five-minute window"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\" AND (resource.labels.service_name=\"${local.name}-api\" OR resource.labels.service_name=\"${local.name}-worker\")"
      comparison      = "COMPARISON_GT"
      threshold_value = 9
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger { count = 1 }
    }
  }
  documentation {
    content   = "Inspect metadata-only service logs and failed tasks. For uncertain Google publication, reconcile by GET; never blindly repeat PUT. Keep the global kill switch on while investigating."
    mime_type = "text/markdown"
  }
  depends_on = [google_project_service.required]
}

resource "google_monitoring_alert_policy" "dead_letters" {
  display_name          = "${local.name}: unprocessed review dead letters"
  combiner              = "OR"
  notification_channels = google_monitoring_notification_channel.operator[*].name
  conditions {
    display_name = "Dead-letter backlog persists for five minutes"
    condition_threshold {
      filter          = "resource.type=\"pubsub_subscription\" AND metric.type=\"pubsub.googleapis.com/subscription/num_undelivered_messages\" AND resource.labels.subscription_id=\"${google_pubsub_subscription.dead_letter_inbox.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "300s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
      trigger { count = 1 }
    }
  }
  documentation {
    content   = "Inspect the review DLQ with authorized operator credentials. Restore OAuth or downstream services, then redeliver the original envelope through the authenticated worker. Do not acknowledge unresolved events or publish a reply directly."
    mime_type = "text/markdown"
  }
  depends_on = [google_project_service.required]
}
