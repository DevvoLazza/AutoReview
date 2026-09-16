# Engineering security model

This document describes implemented boundaries and required live acceptance checks. It is not a certification, legal opinion, or claim that a live deployment has been audited. Report vulnerabilities privately using [SECURITY.md](../SECURITY.md).

## Core invariants

1. Tenant data is accessed only within the authenticated workspace context.
2. AI can prepare a draft but cannot authorize or publish it.
3. Flagged sensitive cases cannot be made automatically eligible through tenant rules.
4. Concurrent commands and uncertain transport outcomes must not trigger duplicate publication.
5. Logs and push payloads exclude review, reply, prompt, document and credential contents.
6. Google-derived content has bounded retention, including publication copies and backups.

## Identity and authorization

The API verifies Identity Platform JWT signature, issuer, audience, expiry, verified email and scoped role claims. A live account lookup additionally rejects disabled users, revoked sessions and changed grants. Account-check failures fail closed. MFA is required for owner/approver mutation commands; read access permits verification and enrollment first.

The dashboard stores encrypted identity credentials in a Secure HttpOnly SameSite cookie in production. Background token refresh does not reset that cookie, preventing a late response from recreating a cleared browser session. Mutation routes check the configured web origin. Native sessions use SecureStore, serialized writes and generation guards so logout wins over pending refreshes; browser mobile previews use session-only storage. No Google/OpenRouter secret is sent to either client. Public registration is disabled; an operator grants roles and revokes prior sessions through the administrator CLI.

The initial production release accepts only its configured workspace. Every role currently has workspace-wide review read access; there are no per-user location grants. Do not represent it as a granular enterprise team-permissions product.

## Database boundary

The PostgreSQL repository uses explicit tenant predicates and parameterized transaction-local tenant context. Both runtime tables enable and force RLS. Atomic CAS batches bind state transitions to record versions, including publication intent. The production startup check refuses SUPERUSER, BYPASSRLS, CREATEROLE, CREATEDB, runtime-table ownership and missing forced RLS.

Migration credentials and service identity are separate from runtime credentials. The runtime group gets DML only, not schema ownership, TRUNCATE or trigger-management privileges. Audit UPDATE/DELETE is rejected by a trigger. The in-memory adapter is development-only, not a substitute for database enforcement.

PGlite/pgvector tests verify actual PostgreSQL behavior across tenants, stale versions, rollback, audit mutation and vector-source filtering. A live Cloud SQL/runtime-user test and an isolated TCP PostgreSQL check remain deployment acceptance evidence.

## Google and workflow

OAuth uses an HMAC-signed ten-minute state and a persisted single-use nonce. Live account/location discovery verifies owner-authorized resources; importing a location records explicit consent and configures notifications before activating it. Existing foreign notification-topic configuration is not silently overwritten.

Cloud KMS encrypts stored Google token payloads with tenant-bound additional authenticated data. Local persistent development may use a supplied AES-256-GCM key; ephemeral encryption keys are not accepted for durable storage. Tokens are never returned to clients or printed.

Before sending, the application rechecks source versions/validity, authorized location and the canonical review. Changed/answered reviews invalidate the draft. Publication state and desired reply intent commit together. A confirmed canonical reply is required for success. An uncertain outcome remains `publishing`, and reconciliation never blindly repeats PUT.

Disconnect first enables the kill switch and deactivates locations. It attempts remote notification cleanup/token revocation and immediately removes local tokens and temporary review/publication/device/OAuth/event records. If remote cleanup fails, the UI instructs the owner to revoke access directly in Google; the application does not claim successful remote revocation.

## AI and documents

The model receives delimited untrusted review content and approved knowledge, with no tools or application credentials. Structured output, independent draft validation, deterministic risk patterns, source-ID checks and source-version revalidation are complementary controls—not proof that a model can never fabricate a statement.

Automatic rules default off. Owner consent, MFA, an operator release gate, location calibration, daily reservations and the global kill switch all apply again at delivery. Reviewed-language/category evaluations are required before enabling automation. Deterministic patterns currently emphasize Italian/English; multilingual model flags are not an exhaustive safety classifier.

OpenRouter requests demand ZDR, data-collection denial, required-parameter support and a reviewed provider allowlist. Operators must independently confirm selected endpoints, disable optional prompt logging, and validate actual processing regions and DPA/SCC terms. Vertex embeds approved document chunks and review queries; its separate processing region must be included in the data assessment.

PDF/DOCX extraction runs in a separate Node process with a 15-second timeout, bounded V8 heap, minimal environment and ignored parser output streams. Inputs are bounded to 4 MB and text to 250,000 characters; PDFs are capped at 100 pages. Scanned PDFs require external OCR. Process isolation prevents native crashes from terminating the API; it is **not** an OS-level malicious-document sandbox or a total native-memory cap. Originals are not archived.

## Service identities and notifications

Pub/Sub, Tasks and Scheduler invoke the worker using a dedicated Google OIDC identity and Cloud Run IAM. The worker checks issuer, signature, audience and verified service-account email, then uses an independent rotatable credential to call internal API routes. The worker has no database, KMS or Google-token access.

Push payloads contain generic messages and a review UUID route, not customer/review contents. Approval happens only after opening the authenticated screen. Durable retry records contain identifiers and submission metadata; obsolete drafts are not re-notified. Expo ticket errors are inspected and unregistered devices removed. Accepted tickets do not prove device delivery; the inbox remains authoritative.

## Retention, logs and recovery

Google review aggregates expire after 21 days; reads hide expired content and an hourly job physically removes it. Publication intent expires with the review. Metadata-only audit does not retain prompt/reply copies. Terraform limits backups/PITR to seven days; validate actual cleanup and restored-backup re-purging before asserting Google's retention requirement is satisfied.

Fastify/API logs redact authentication and cookies; request serialization excludes OAuth query parameters. Errors log only safe classifications. Never enable response-body, prompt or document logging in middleware, observability integrations or external proxies. Service metrics and audit are not a full OpenTelemetry tracing implementation.

Terraform provides private SQL connectivity, service-specific secret access, KMS, backup settings, and initial Cloud Run/DLQ alerts. Remote state must be encrypted/access-controlled because state contains secrets. Confirm alert-channel delivery and add/test purge/Scheduler failure alerts, key rotation, restore and incident-response runbooks before production.

## External acceptance gates

Google approval and policy confirmation; live OAuth/Pub/Sub/revocation; Cloud SQL grants and tenant tests; KMS encryption/decryption; actual provider/ZDR/region behavior; identity/TOTP/revocation; lost-response publication recovery; physical iOS/Android push/deep links; dependency/DAST review; purge/backup restoration; privacy terms and store signing remain mandatory. None is established solely by local tests or Terraform validation.
