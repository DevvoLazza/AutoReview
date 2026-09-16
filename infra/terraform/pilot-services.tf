resource "google_identity_platform_config" "pilot" {
  project            = var.project_id
  authorized_domains = [trimprefix(var.web_origin, "https://")]
  sign_in {
    email {
      enabled           = true
      password_required = true
    }
    anonymous { enabled = false }
  }
  client {
    permissions { disabled_user_signup = true }
  }
  mfa {
    state = "ENABLED"
    provider_configs {
      state = "ENABLED"
      totp_provider_config { adjacent_intervals = 1 }
    }
  }
  depends_on = [google_project_service.required]
}

resource "random_id" "auth_cookie" { byte_length = 32 }
resource "google_secret_manager_secret_version" "auth_cookie" {
  secret      = google_secret_manager_secret.secrets["auth-cookie-secret"].id
  secret_data = random_id.auth_cookie.b64_std
}
resource "google_service_account" "web" {
  account_id   = "${local.name}-web"
  display_name = "AutoReview authenticated dashboard"
}
resource "google_secret_manager_secret_iam_member" "web_cookie" {
  secret_id = google_secret_manager_secret.secrets["auth-cookie-secret"].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.web.email}"
}
resource "google_project_iam_member" "api_identity_reader" {
  project = var.project_id
  role    = "roles/firebaseauth.viewer"
  member  = "serviceAccount:${google_service_account.api.email}"
}
resource "google_project_iam_member" "api_embeddings" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.api.email}"
}
resource "google_project_iam_member" "api_sql_connector" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}
resource "google_pubsub_topic_iam_member" "google_review_publisher" {
  topic  = google_pubsub_topic.google_reviews.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:mybusiness-api-pubsub@system.gserviceaccount.com"
}
resource "google_cloud_run_v2_service" "web" {
  name     = "${local.name}-web"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  template {
    service_account = google_service_account.web.email
    timeout         = "120s"
    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }
    containers {
      image = var.web_image
      ports { container_port = 3000 }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "WEB_AUTH_MODE"
        value = "identity"
      }
      env {
        name  = "WEB_ORIGIN"
        value = var.web_origin
      }
      env {
        name  = "API_INTERNAL_URL"
        value = "${google_cloud_run_v2_service.api.uri}/v1"
      }
      env {
        name  = "IDENTITY_API_KEY"
        value = google_identity_platform_config.pilot.client[0].api_key
      }
      env {
        name = "AUTH_COOKIE_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret_version.auth_cookie.secret
            version = "latest"
          }
        }
      }
      resources { limits = { cpu = "1", memory = "512Mi" } }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.web_cookie]
}
resource "google_cloud_run_v2_service_iam_member" "public_web" {
  name     = google_cloud_run_v2_service.web.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
resource "google_service_account_iam_member" "scheduler_uses_push" {
  service_account_id = google_service_account.push.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
}
resource "google_service_account_iam_member" "tasks_uses_push" {
  service_account_id = google_service_account.push.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloudtasks.iam.gserviceaccount.com"
  depends_on         = [google_project_service.required]
}
resource "random_password" "migration_database" {
  length  = 40
  special = false
}
resource "google_sql_user" "migrator" {
  name     = "reviewguard_migrator"
  instance = google_sql_database_instance.postgres.name
  password = random_password.migration_database.result
}
resource "google_secret_manager_secret_version" "migration_database_url" {
  secret      = google_secret_manager_secret.secrets["migration-database-url"].id
  secret_data = "postgresql://reviewguard_migrator:${random_password.migration_database.result}@/reviewguard?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}"
}
resource "google_service_account" "migrator" {
  account_id   = "${local.name}-migrate"
  display_name = "AutoReview schema migrations only"
}
resource "google_project_iam_member" "migrator_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.migrator.email}"
}
resource "google_secret_manager_secret_iam_member" "migrator_database" {
  secret_id = google_secret_manager_secret.secrets["migration-database-url"].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migrator.email}"
}
resource "google_cloud_run_v2_job" "migrate" {
  name     = "${local.name}-migrate"
  location = var.region
  template {
    template {
      service_account = google_service_account.migrator.email
      max_retries     = 0
      timeout         = "300s"
      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.private.name
          subnetwork = google_compute_subnetwork.apps.name
        }
      }
      volumes {
        name = "cloudsql"
        cloud_sql_instance { instances = [google_sql_database_instance.postgres.connection_name] }
      }
      containers {
        image   = var.api_image
        command = ["node"]
        args    = ["packages/database/scripts/migrate.mjs"]
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret_version.migration_database_url.secret
              version = "latest"
            }
          }
        }
        env {
          name  = "PROVISION_RUNTIME_ROLE"
          value = "true"
        }
        resources { limits = { cpu = "1", memory = "512Mi" } }
      }
    }
  }
  depends_on = [google_project_iam_member.migrator_sql, google_secret_manager_secret_iam_member.migrator_database, google_sql_user.migrator, google_sql_database.app]
}
resource "google_cloud_scheduler_job" "retention" {
  name             = "${local.name}-retention"
  region           = var.region
  schedule         = "15 * * * *"
  time_zone        = "Etc/UTC"
  attempt_deadline = "120s"
  http_target {
    uri         = "${google_cloud_run_v2_service.worker.uri}/tasks/purge-expired-google-content"
    http_method = "POST"
    body        = base64encode("{}")
    headers     = { "Content-Type" = "application/json" }
    oidc_token {
      service_account_email = google_service_account.push.email
      audience              = var.worker_public_url
    }
  }
  depends_on = [google_project_service.required, google_service_account_iam_member.scheduler_uses_push]
}
resource "google_pubsub_subscription" "dead_letter_inbox" {
  name                       = "${local.name}-dead-letter-inbox"
  topic                      = google_pubsub_topic.dead_letter.id
  message_retention_duration = "604800s"
}
resource "google_cloud_scheduler_job" "notification_retry" {
  name             = "${local.name}-notification-retry"
  region           = var.region
  schedule         = "*/5 * * * *"
  time_zone        = "Etc/UTC"
  attempt_deadline = "120s"
  http_target {
    uri         = "${google_cloud_run_v2_service.worker.uri}/tasks/retry-notifications"
    http_method = "POST"
    body        = base64encode("{}")
    headers     = { "Content-Type" = "application/json" }
    oidc_token {
      service_account_email = google_service_account.push.email
      audience              = var.worker_public_url
    }
  }
  depends_on = [google_project_service.required, google_service_account_iam_member.scheduler_uses_push]
}
