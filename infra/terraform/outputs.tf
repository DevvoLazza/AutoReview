output "api_url" { value = google_cloud_run_v2_service.api.uri }
output "worker_url" { value = google_cloud_run_v2_service.worker.uri }
output "web_url" { value = google_cloud_run_v2_service.web.uri }
output "pubsub_topic" { value = google_pubsub_topic.google_reviews.id }
output "publish_queue" { value = google_cloud_tasks_queue.publish.id }
output "knowledge_bucket" { value = google_storage_bucket.knowledge.name }
output "token_kms_key" { value = google_kms_crypto_key.tokens.id }
