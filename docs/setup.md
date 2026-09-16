# Setup and deployment

## Choose the operating mode

- **Local demo:** `pnpm build` followed by `pnpm dev:demo`. Explicit simulated services, no live credentials, volatile data, no real publication.
- **Persistent development:** PostgreSQL plus a local encryption key; live integrations are optional and must be selected explicitly.
- **Controlled pilot:** dedicated Google Cloud project, approved Google access, Identity Platform, KMS, PostgreSQL and live-service adapters. Initially manual approval only.

The demo launcher starts the compiled API and the dashboard, not the worker or native app. API edits require rebuilding; the dashboard has Next.js hot reload. Nothing auto-loads the repository `.env` for every workspace: use Node's `--env-file` for compiled services, or pass deployment environment variables explicitly.

## Persistent local development

Docker is optional and is not installed by this project. The compose definition uses PostgreSQL 17 with `pgvector` and a named data volume. Do not reuse a PostgreSQL 18 data directory with PostgreSQL 17; use a deliberate dump/restore migration. Never remove an existing volume just to fix startup.

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
node --env-file=.env packages/database/scripts/migrate.mjs
```

Generate a 32-byte encryption key with a trusted secret tool and place its base64 value in `TOKEN_ENCRYPTION_KEY` in the untracked `.env`. Do not paste keys into issues, chat, screenshots, or logs. Set `STORAGE_MODE=postgres`; keep `AUTH_MODE=demo`, `GOOGLE_MODE=mock`, `AI_MODE=mock`, `TASKS_MODE=demo` and `EMBEDDING_MODE=demo` for simulated persistent development.

```powershell
node --env-file=.env apps/api/dist/main.js
```

In a second terminal:

```powershell
Set-Location apps/web
node --env-file=../../.env node_modules/next/dist/bin/next dev --port 3000
```

The demo launch command intentionally overrides persistent/live modes; do not use it to start a real pilot. Identity authentication must be configured before using `NODE_ENV=production`. PostgreSQL demo seeding is for development only.

## User access and MFA

1. Enable Identity Platform email/password and TOTP. Disable public signup for this pilot.
2. Create users in the Identity Platform console. Configure email action domains/templates, then verify each user's email.
3. Choose a workspace UUID and a separate application-user UUID per person. `GOOGLE_WEBHOOK_TENANT_ID` must equal the workspace UUID in production.
4. Review the administrator command in dry-run mode:

```bash
pnpm --filter @reviewguard/api identity:grant --project PROJECT_ID --uid IDENTITY_UID --tenant TENANT_UUID --user-id APP_USER_UUID --role owner
```

Append `--apply` only after reviewing the target. The command uses the operator's Application Default Credentials, preserves unrelated custom claims, assigns `tenant_id`, `app_user_id` and `role`, and revokes previous sessions. It requires operator permissions to read/update Identity Platform accounts; the API has read-only account access.

Roles are `owner`, `admin`, `editor`, and `approver`. Owners and approvers must complete TOTP before mutation commands. An owner can sign in, request email verification, and enroll TOTP at `/mfa` before publishing or configuring integrations. The app does not offer public account creation or a self-service team-administration screen.

The API checks disabled accounts, token revocation, verified email, and current role/workspace claims on each authenticated request. Grant changes require signing in again.

## Native mobile app

Create an untracked `apps/mobile/.env.local` with:

```dotenv
EXPO_PUBLIC_AUTH_MODE=identity
EXPO_PUBLIC_API_URL=https://YOUR_API_ORIGIN/v1
EXPO_PUBLIC_IDENTITY_API_KEY=YOUR_IDENTITY_PLATFORM_WEB_KEY
EXPO_PUBLIC_EAS_PROJECT_ID=YOUR_REAL_EAS_PROJECT_UUID
```

Identity web API keys identify the authentication project; restrict their allowed APIs as appropriate. Never put Google OAuth client secrets, refresh tokens, OpenRouter keys or internal worker secrets in `EXPO_PUBLIC_*` variables.

For a development-only simulated app, select `EXPO_PUBLIC_AUTH_MODE=demo` and use your computer's reachable LAN API address. `localhost` on a phone is the phone, not your development computer. Start a deliberately LAN-bound development API with `HOST=0.0.0.0` only on a trusted private test network; the demo launcher binds to loopback by default. Keep demonstration authentication off public networks. Do not carry the example's `HOST=127.0.0.1` into Cloud Run; production containers must listen on `0.0.0.0`.

```bash
pnpm --filter @reviewguard/mobile dev
```

Native push requires a real EAS project, development build, appropriate FCM/APNs credentials and device permission; Expo Go is not sufficient. Use your authorized Expo/EAS account to build the `development` profile. Test login, TOTP, logout, restored session, foreground/background/terminated deep links and permission refusal on physical devices. Production config requires HTTPS, an actual EAS UUID, an Identity key, and non-demo authentication.

No APK, IPA, signing identity or store listing is generated by JavaScript export. Windows cannot provide local Xcode/iOS Simulator evidence. EAS build/submission and store accounts are operator-controlled external steps and can incur costs.

## Dedicated Google Cloud pilot

Do not execute cloud provisioning until Google API approval, billing authorization, region and data-processing requirements have been agreed. Terraform validation is not permission to deploy.

1. Authenticate an authorized deployment operator. Review `infra/terraform/terraform.tfvars.example`; use real project IDs, UUIDs, HTTPS origins and immutable image digests. Keep populated `terraform.tfvars` untracked.
2. Bootstrap an Artifact Registry repository or another authorized image registry, then build/push `Dockerfile.api`, `Dockerfile.worker` and `Dockerfile.web`. Image build/push has not been verified in a local Docker engine here.
3. Use an access-controlled, encrypted remote Terraform state backend with locking. State contains sensitive credentials despite Terraform's `sensitive` display flag; do not commit or share local state. Backend setup belongs to the deployment operator.
4. Verify the project's Business Profile APIs, OAuth consent/redirects, Identity Platform eligibility and Vertex embedding model/region/quota. Compute and SQL default to `europe-west8`; embeddings default to `europe-west4` and do not imply all AI processing occurs in Italy.
5. Review configuration locally:

```bash
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform fmt -check
terraform -chdir=infra/terraform validate
terraform -chdir=infra/terraform plan
```

### First-deployment migration order

The runtime database user cannot own or create application tables. The migration job uses a separate Cloud SQL user, service identity and database secret. On a fresh project, bootstrap its dependencies **before** creating the runtime user/service:

```bash
terraform -chdir=infra/terraform apply -target=google_cloud_run_v2_job.migrate
gcloud run jobs execute reviewguard-pilot-migrate --region europe-west8 --project PROJECT_ID --wait
terraform -chdir=infra/terraform plan
terraform -chdir=infra/terraform apply
```

Use the actual environment/region when not `pilot`/`europe-west8`. Targeted apply is a documented bootstrap exception, not the normal update workflow. The job applies migrations and creates the `reviewguard_runtime` group with only the required DML grants. Terraform then creates the `reviewguard` login with that custom database role, not `cloudsqlsuperuser`. The API refuses privileged roles, ownership of runtime tables, or missing forced RLS.

For subsequent releases: review backward-compatible migrations, update the migration image, execute the job successfully, and deploy the application image. Never run migration/admin credentials in the API. A migration failure is a stop condition, not a reason to bypass startup checks.

### Connectivity and release defaults

- Configure real HTTPS origins that reach the provisioned services; Terraform does not provision custom-domain DNS/certificates/load balancers. Alternatively use verified stable Cloud Run URLs and update configuration after bootstrap.
- Google OAuth redirect must exactly match `${api_public_url}/v1/integrations/google/callback`.
- `worker_public_url` is the Cloud Tasks target and OIDC audience; Pub/Sub and Scheduler must use the same audience. Worker IAM allows only the configured push service account.
- Restrict the deployer's `iam.serviceAccounts.actAs` permission to the required identities and confirm Pub/Sub/Tasks/Scheduler service-agent token permissions.
- Set `alert_email` to a monitored address and confirm notification-channel delivery. Terraform includes Cloud Run server-error and review-DLQ alerts; add and validate Scheduler/purge-failure alerts before production.
- Leave `AUTOMATION_RELEASE_APPROVED=false`. Terraform deliberately keeps it false; a reviewed configuration change is required to release automatic publication.
- Secrets belong in Secret Manager. If Expo advanced push-token enforcement is enabled, supply `EXPO_ACCESS_TOKEN` as an additional API secret and grant only API access.

## Retention and recovery

Runtime Google content expires after 21 days. Reads hide expired records immediately; Scheduler purges physically every hour. Publication copies share the parent expiry. Notification retry metadata expires within 48 hours and contains no review content. Terraform retains seven daily backups and seven days of PITR to leave a conservative buffer under Google's retention limit.

Validate purge timing, deleted-content backup lifetime, restored-backup re-purging, Pub/Sub payload contents and any independent logging/storage systems. Do not extend backup retention without reassessing content policy. The infrastructure definition alone is not proof of retention compliance.

Publication stuck in `publishing` can be reconciled from the review screen after the two-minute in-flight window. Reconciliation reads Google without repeating PUT; if no reply was accepted, the case returns to manual approval. Always inspect the canonical result before approving again.

## Verification and release evidence

Run the commands in the [README](../README.md#verification), then complete [real pilot acceptance](go-live-google.md). Local tests and Terraform validation do not replace a live database/network test, provider audit, physical-device push, backup restore, privacy review or store signing.
