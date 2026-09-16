export function assertStartupConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  for (const [name, expected] of Object.entries({
    AUTH_MODE: "identity",
    STORAGE_MODE: "postgres",
    GOOGLE_MODE: "live",
    AI_MODE: "live",
    TASKS_MODE: "live",
    EMBEDDING_MODE: "vertex",
  })) {
    if (env[name] !== expected) throw new Error(`${name} must be ${expected} in production`);
  }
  for (const name of [
    "DATABASE_URL",
    "GOOGLE_KMS_KEY_NAME",
    "IDENTITY_PROJECT_ID",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "GOOGLE_PUBSUB_TOPIC",
    "OAUTH_STATE_SECRET",
    "INTERNAL_WORKER_SECRET",
    "OPENROUTER_API_KEY",
    "OPENROUTER_MODEL",
    "OPENROUTER_PROVIDER_ALLOWLIST",
    "GOOGLE_WEBHOOK_TENANT_ID",
    "GOOGLE_WEBHOOK_ACTOR_ID",
    "WEB_ORIGIN",
    "WORKER_PUBLIC_URL",
    "GOOGLE_CLOUD_PROJECT",
    "TASKS_QUEUE",
    "PUSH_SERVICE_ACCOUNT_EMAIL",
  ]) {
    if (!env[name]?.trim()) throw new Error(`${name} is required in production`);
  }
  for (const name of ["GOOGLE_REDIRECT_URI", "WEB_ORIGIN", "WORKER_PUBLIC_URL"])
    if (!env[name]?.startsWith("https://")) throw new Error(`${name} requires HTTPS`);
  if (env.OPENROUTER_BASE_URL && !env.OPENROUTER_BASE_URL.startsWith("https://"))
    throw new Error("OPENROUTER_BASE_URL requires HTTPS");
  if (!env.OPENROUTER_PROVIDER_ALLOWLIST?.split(",").some((value) => value.trim()))
    throw new Error("A non-empty provider allowlist is required");
  if ((env.OAUTH_STATE_SECRET?.length ?? 0) < 32 || (env.INTERNAL_WORKER_SECRET?.length ?? 0) < 32)
    throw new Error("Worker/OAuth secrets must contain at least 32 characters");
}
