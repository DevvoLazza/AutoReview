# AutoReview implementation continuity

## Snapshot

- Branch: `codex/production-pilot`, based on `dev`.
- Goal: replace demonstration-only paths with a safe, usable manually approved pilot.
- No live Google, OpenRouter or cloud credentials supplied. Never claim production verification without them.

## Progress

- Persistent tenant-scoped PostgreSQL repository, CAS batches, forced RLS, append-only audit and expiry implemented.
- Google OAuth nonce, authorized location import/sync/disconnect and canonical review revalidation implemented.
- Recoverable publication intent and GET-only uncertain-outcome reconciliation implemented and tested.
- Identity Platform/TOTP, account grant/revocation checks, KMS vault and secure web/native sessions implemented.
- Versioned knowledge/document extraction and Vertex/pgvector hybrid retrieval implemented; no automatic learning.
- Web/mobile inboxes and review actions, sources, knowledge lifecycle, rules/simulation, preferences and audit wired to API.
- Content-free push outbox, Expo ticket checks, invalid-device removal and scheduled retries implemented.
- Terraform identity/web/worker/migrations/retention/initial monitoring validated; no cloud apply performed.
- English README and engineering/setup/API/release docs distinguish implemented pilot from unverified production gates.
- User confirmed no approved Google Cloud Business Profile project. Live connection remains external.

## Verification

- 70 automated tests pass; one optional TCP PostgreSQL test skipped without TEST_DATABASE_URL.
- Six Playwright desktop/mobile-web scenarios pass; all seven workspace typechecks/builds pass.
- Android/iOS Hermes exports pass; these are not signed APK/IPA or physical-device tests.
- Biome, diff whitespace, Terraform fmt/validate pass. CI expanded; inspect exact pushed head before reporting its result.
- PDF native worker-thread crash on Windows fixed with a bounded child process; real PDF/DOCX extraction tests pass.
- Test/dev server cleanup and Hermes compiler require appropriate Windows execution permissions, not source workarounds.

## Decisions

- Manual approval remains the default. Automatic publication must fail closed.
- Keep mock adapters explicit and prohibited in production.
- Use small commits. PR target must be `dev`; do not update `main` directly.
- Runtime SQL user must be non-owner, NOSUPERUSER/NOBYPASSRLS/NOCREATEROLE/NOCREATEDB. Fresh cloud bootstrap: targeted migration job provisioning, execute it, then full apply.
- No SaaS billing/team self-service, original document archive, correction dataset, full OTel or Expo receipt analytics shipped; these are documented expansion scope.
- Integrate remote dev audit: preserve location/limit filtering, parameterized SQL and generation failure audit; pre-PUT failures are recoverable while uncertain PUT outcomes require GET-only reconciliation.
