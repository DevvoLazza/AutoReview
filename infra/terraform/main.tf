locals {
  name = "reviewguard-${var.environment}"
  apis = toset([
    "artifactregistry.googleapis.com",
    "cloudkms.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "iamcredentials.googleapis.com",
    "pubsub.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com",
    "monitoring.googleapis.com",
    "identitytoolkit.googleapis.com",
    "aiplatform.googleapis.com",
    "mybusinessaccountmanagement.googleapis.com",
    "mybusinessbusinessinformation.googleapis.com",
    "mybusinessnotifications.googleapis.com",
  ])
}

data "google_project" "current" {}

resource "google_project_service" "required" {
  for_each           = local.apis
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "api" {
  account_id   = "${local.name}-api"
  display_name = "ReviewGuard API"
}

resource "google_service_account" "worker" {
  account_id   = "${local.name}-worker"
  display_name = "ReviewGuard worker"
}

resource "google_service_account" "push" {
  account_id   = "${local.name}-push"
  display_name = "PubSub and Cloud Tasks push identity"
}

resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = local.name
  format        = "DOCKER"
  depends_on    = [google_project_service.required]
}

resource "google_compute_network" "private" {
  name                    = "${local.name}-network"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.required]
}

resource "google_compute_subnetwork" "apps" {
  name          = "${local.name}-apps"
  region        = var.region
  network       = google_compute_network.private.id
  ip_cidr_range = "10.88.0.0/24"
}

resource "google_compute_global_address" "services" {
  name          = "${local.name}-service-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.private.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.private.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.services.name]
  depends_on              = [google_project_service.required]
}

resource "random_password" "database" {
  length  = 40
  special = false
}

resource "random_password" "worker_secret" {
  length  = 48
  special = false
}

resource "random_password" "oauth_state" {
  length  = 48
  special = false
}

resource "google_sql_database_instance" "postgres" {
  name                = "${local.name}-postgres"
  region              = var.region
  database_version    = "POSTGRES_17"
  deletion_protection = var.environment == "production"
  settings {
    tier              = var.environment == "production" ? "db-custom-2-7680" : "db-custom-1-3840"
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_type         = "PD_SSD"
    disk_autoresize   = true
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }
    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.private.id
      enable_private_path_for_google_cloud_services = true
    }
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
  }
  depends_on = [google_service_networking_connection.private_vpc]
}

resource "google_sql_database" "app" {
  name     = "reviewguard"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app" {
  name           = "reviewguard"
  instance       = google_sql_database_instance.postgres.name
  password       = random_password.database.result
  database_roles = ["reviewguard_runtime"]
  # Bootstrap the migration job and execute it before creating this restricted role.
}

resource "google_kms_key_ring" "app" {
  name       = local.name
  location   = var.region
  depends_on = [google_project_service.required]
}

resource "google_kms_crypto_key" "tokens" {
  name            = "google-oauth-tokens"
  key_ring        = google_kms_key_ring.app.id
  rotation_period = "7776000s"
  lifecycle {
    prevent_destroy = true
  }
}

resource "google_storage_bucket" "knowledge" {
  name                        = "${var.project_id}-${local.name}-knowledge"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  versioning {
    enabled = true
  }
  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(["database-url", "migration-database-url", "google-client-id", "google-client-secret", "openrouter-api-key", "worker-secret", "oauth-state-secret", "auth-cookie-secret"])
  secret_id = "${local.name}-${each.value}"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.secrets["database-url"].id
  secret_data = "postgresql://reviewguard:${random_password.database.result}@/reviewguard?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}"
}

resource "google_secret_manager_secret_version" "google_client_id" {
  secret      = google_secret_manager_secret.secrets["google-client-id"].id
  secret_data = var.google_client_id
}

resource "google_secret_manager_secret_version" "google_client_secret" {
  secret      = google_secret_manager_secret.secrets["google-client-secret"].id
  secret_data = var.google_client_secret
}

resource "google_secret_manager_secret_version" "openrouter" {
  secret      = google_secret_manager_secret.secrets["openrouter-api-key"].id
  secret_data = var.openrouter_api_key
}

resource "google_secret_manager_secret_version" "worker" {
  secret      = google_secret_manager_secret.secrets["worker-secret"].id
  secret_data = random_password.worker_secret.result
}

resource "google_secret_manager_secret_version" "oauth_state" {
  secret      = google_secret_manager_secret.secrets["oauth-state-secret"].id
  secret_data = random_password.oauth_state.result
}

resource "google_secret_manager_secret_iam_member" "api_access" {
  for_each  = toset(["database-url", "google-client-id", "google-client-secret", "openrouter-api-key", "worker-secret", "oauth-state-secret"])
  secret_id = google_secret_manager_secret.secrets[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "worker_access" {
  for_each  = toset(["worker-secret"])
  secret_id = google_secret_manager_secret.secrets[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_kms_crypto_key_iam_member" "api_encrypt" {
  crypto_key_id = google_kms_crypto_key.tokens.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${google_service_account.api.email}"
}

resource "google_storage_bucket_iam_member" "api_documents" {
  bucket = google_storage_bucket.knowledge.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_tasks" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_service_account_iam_member" "api_uses_push_identity" {
  service_account_id = google_service_account.push.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.api.email}"
}

resource "google_cloud_run_v2_service" "api" {
  name     = "${local.name}-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  template {
    service_account = google_service_account.api.email
    scaling {
      min_instance_count = var.environment == "production" ? 1 : 0
      max_instance_count = 10
    }
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.private.name
        subnetwork = google_compute_subnetwork.apps.name
      }
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }
    containers {
      image = var.api_image
      ports {
        container_port = 4100
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = "4100"
      }
      env {
        name  = "AUTH_MODE"
        value = "identity"
      }
      env {
        name  = "STORAGE_MODE"
        value = "postgres"
      }
      env {
        name  = "IDENTITY_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "WEB_ORIGIN"
        value = var.web_origin
      }
      env {
        name  = "AI_MODE"
        value = "live"
      }
      env {
        name  = "OPENROUTER_MODEL"
        value = var.openrouter_model
      }
      env {
        name  = "OPENROUTER_PROVIDER_ALLOWLIST"
        value = var.openrouter_provider_allowlist
      }
      env {
        name  = "GOOGLE_MODE"
        value = "live"
      }
      env {
        name  = "GOOGLE_PUBSUB_TOPIC"
        value = google_pubsub_topic.google_reviews.id
      }
      env {
        name  = "AUTOMATION_RELEASE_APPROVED"
        value = "false"
      }
      env {
        name  = "EMBEDDING_MODE"
        value = "vertex"
      }
      env {
        name  = "EMBEDDING_MODEL"
        value = var.embedding_model
      }
      env {
        name  = "EMBEDDING_LOCATION"
        value = var.embedding_location
      }
      env {
        name  = "TASKS_MODE"
        value = "live"
      }
      env {
        name  = "TASKS_LOCATION"
        value = var.region
      }
      env {
        name  = "TASKS_QUEUE"
        value = google_cloud_tasks_queue.publish.name
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "WORKER_PUBLIC_URL"
        value = var.worker_public_url
      }
      env {
        name  = "PUSH_SERVICE_ACCOUNT_EMAIL"
        value = google_service_account.push.email
      }
      env {
        name  = "GOOGLE_REDIRECT_URI"
        value = "${var.api_public_url}/v1/integrations/google/callback"
      }
      env {
        name  = "GOOGLE_WEBHOOK_TENANT_ID"
        value = var.pilot_tenant_id
      }
      env {
        name  = "GOOGLE_WEBHOOK_ACTOR_ID"
        value = var.pilot_actor_id
      }
      env {
        name  = "GOOGLE_KMS_KEY_NAME"
        value = google_kms_crypto_key.tokens.id
      }
      dynamic "env" {
        for_each = {
          DATABASE_URL           = google_secret_manager_secret_version.database_url.secret
          GOOGLE_CLIENT_ID       = google_secret_manager_secret_version.google_client_id.secret
          GOOGLE_CLIENT_SECRET   = google_secret_manager_secret_version.google_client_secret.secret
          OPENROUTER_API_KEY     = google_secret_manager_secret_version.openrouter.secret
          INTERNAL_WORKER_SECRET = google_secret_manager_secret_version.worker.secret
          OAUTH_STATE_SECRET     = google_secret_manager_secret_version.oauth_state.secret
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }
    }
  }
  depends_on = [google_project_service.required, google_secret_manager_secret_iam_member.api_access, google_kms_crypto_key_iam_member.api_encrypt, google_project_iam_member.api_sql_connector, google_project_iam_member.api_identity_reader, google_project_iam_member.api_embeddings]
}

resource "google_cloud_run_v2_service" "worker" {
  name     = "${local.name}-worker"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  template {
    service_account = google_service_account.worker.email
    timeout         = "120s"
    scaling {
      min_instance_count = 0
      max_instance_count = 20
    }
    containers {
      image = var.worker_image
      ports {
        container_port = 4200
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "WORKER_PORT"
        value = "4200"
      }
      env {
        name  = "WORKER_AUTH_MODE"
        value = "google-oidc"
      }
      env {
        name  = "WORKER_PUBLIC_URL"
        value = var.worker_public_url
      }
      env {
        name  = "PUSH_SERVICE_ACCOUNT_EMAIL"
        value = google_service_account.push.email
      }
      env {
        name  = "API_INTERNAL_URL"
        value = "${google_cloud_run_v2_service.api.uri}/v1"
      }
      dynamic "env" {
        for_each = {
          INTERNAL_WORKER_SECRET = google_secret_manager_secret_version.worker.secret
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }
  depends_on = [google_project_service.required, google_secret_manager_secret_iam_member.worker_access]
}

resource "google_cloud_run_v2_service_iam_member" "push_invokes_worker" {
  name     = google_cloud_run_v2_service.worker.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.push.email}"
}

resource "google_cloud_run_v2_service_iam_member" "public_invokes_api" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_service_account_iam_member" "pubsub_mints_push_token" {
  service_account_id = google_service_account.push.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_topic" "google_reviews" {
  name       = "${local.name}-google-reviews"
  depends_on = [google_project_service.required]
}

resource "google_pubsub_topic" "dead_letter" {
  name = "${local.name}-google-reviews-dlq"
}

resource "google_pubsub_topic_iam_member" "dead_letter_publisher" {
  topic  = google_pubsub_topic.dead_letter.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_project_iam_member" "pubsub_subscription_reader" {
  project = var.project_id
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_subscription" "google_reviews_push" {
  name                       = "${local.name}-google-reviews-push"
  topic                      = google_pubsub_topic.google_reviews.id
  ack_deadline_seconds       = 120
  message_retention_duration = "604800s"
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 10
  }
  push_config {
    push_endpoint = "${google_cloud_run_v2_service.worker.uri}/events/google-business"
    oidc_token {
      service_account_email = google_service_account.push.email
      audience              = var.worker_public_url
    }
  }
  depends_on = [
    google_cloud_run_v2_service_iam_member.push_invokes_worker,
    google_service_account_iam_member.pubsub_mints_push_token,
    google_pubsub_topic_iam_member.dead_letter_publisher,
    google_project_iam_member.pubsub_subscription_reader,
  ]
}

resource "google_cloud_tasks_queue" "publish" {
  name     = "${local.name}-publish"
  location = var.region
  rate_limits {
    max_concurrent_dispatches = 10
    max_dispatches_per_second = 5
  }
  retry_config {
    max_attempts  = 8
    min_backoff   = "10s"
    max_backoff   = "3600s"
    max_doublings = 5
  }
  depends_on = [google_project_service.required]
}
