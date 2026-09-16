variable "project_id" {
  description = "Google Cloud project dedicated to ReviewGuard."
  type        = string
}

variable "region" {
  description = "Primary data and compute region."
  type        = string
  default     = "europe-west8"
}

variable "environment" {
  type    = string
  default = "pilot"
  validation {
    condition     = contains(["pilot", "staging", "production"], var.environment)
    error_message = "environment must be pilot, staging, or production."
  }
}

variable "api_image" {
  description = "Immutable API container image digest."
  type        = string
}

variable "worker_image" {
  description = "Immutable worker container image digest."
  type        = string
}
variable "web_image" {
  description = "Immutable dashboard container image digest."
  type        = string
}
variable "openrouter_model" {
  description = "Reviewed immutable reply-model snapshot; changing it requires evaluation."
  type        = string
  default     = "deepseek/deepseek-v4-pro-0813"
}
variable "embedding_model" {
  type    = string
  default = "gemini-embedding-001"
}
variable "embedding_location" {
  type    = string
  default = "europe-west4"
}

variable "web_origin" {
  type = string
}

variable "api_public_url" {
  description = "Stable HTTPS origin used in the Google OAuth redirect URI."
  type        = string
}

variable "worker_public_url" {
  description = "Stable HTTPS origin used as Cloud Tasks target and OIDC audience."
  type        = string
}

variable "pilot_tenant_id" {
  description = "Tenant UUID used by the first single-tenant Google notification spike."
  type        = string
}

variable "pilot_actor_id" {
  description = "System actor UUID used by the first single-tenant Google notification spike."
  type        = string
}

variable "google_client_id" {
  type      = string
  sensitive = true
}

variable "google_client_secret" {
  type      = string
  sensitive = true
}

variable "openrouter_api_key" {
  type      = string
  sensitive = true
}

variable "openrouter_provider_allowlist" {
  description = "Comma-separated provider slugs validated for ZDR and required parameters."
  type        = string
}

variable "alert_email" {
  description = "Optional address for operational alerts."
  type        = string
  default     = ""
}
