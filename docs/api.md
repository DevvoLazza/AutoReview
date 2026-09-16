# API reference

REST endpoints use `/v1`. Interactive Swagger is served at `/docs`; the generated route specification is `/openapi.json`. Shared Zod schemas in `packages/contracts` are authoritative for payload validation. The pilot's clients use shared typed contracts and hand-written request helpers, not a generated OpenAPI client.

Production requests require `Authorization: Bearer IDENTITY_PLATFORM_ID_TOKEN`. Verified custom claims identify workspace, application user and role. User-supplied demo headers are ignored in identity mode. The API also verifies current account grants and revocation.

## User endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Public liveness |
| GET | `/session`, `/workspace` | Principal, modes, locations, preferences and current metrics |
| GET | `/reviews` | Inbox; optional `status`, `locationId`, UUID `cursor`, `limit` 1–100 |
| GET | `/reviews/:id` | Current review, version, draft, sources and workflow state |
| POST | `/reviews/:id/generate` | Generate/validate a draft |
| POST | `/reviews/:id/revise` | Regenerate using `instruction` |
| POST | `/reviews/:id/edit` | Save manual `text` and clear automatic eligibility |
| POST | `/reviews/:id/approve` | Publish or reconcile an uncertain publication |
| POST | `/reviews/:id/reject` | Reject, optionally recording that a reason was supplied |
| POST | `/reviews/:id/cancel-schedule` | Cancel scheduled automatic delivery |
| GET / POST | `/knowledge` | List sources / create a draft source |
| GET | `/knowledge/:id` | Read a source |
| POST | `/knowledge/:id/edit`, `/approve`, `/retire` | Versioned source lifecycle; approve also reindexes |
| POST | `/knowledge/documents` | `{filename, base64, language, locationId}`; extracted draft source |
| GET / POST | `/automation-rules` | List / create disabled rules |
| POST | `/automation-rules/simulate` | `{reviewId}`; policy result with no scheduling/publication |
| POST | `/automation-rules/:id/enable`, `/disable` | Owner consent / disable |
| POST | `/workspace/settings` | Owner preferences and global kill switch |
| POST | `/locations/:id/settings` | Default language and tone for a location |
| GET | `/audit` | Owner/admin metadata audit |
| POST | `/devices` | Authenticated Expo token registration |
| GET | `/integrations/google/start`, `/discover` | Owner OAuth initiation / authorized account discovery |
| POST | `/integrations/google/import-location` | `{accountName, locationName, consent: true}` |
| POST | `/integrations/google/sync` | `{locationId, pageToken?}`; canonical import page |
| POST | `/integrations/google/disconnect` | Workspace connection teardown and temporary-data deletion |

List responses return `data`; review lists add `meta: {limit, total, nextCursor}`. If a cursor expires or disappears, refresh from the first page. Google sync returns `imported` and `nextPageToken`; clients continue until it is null.

Workflow and source lifecycle commands require `expectedVersion`. Stale commands return `409 version_conflict`; reload before changing your intent. A published command retried with its persisted original approval version returns the confirmed result. An active publication returns retryable `publication_busy`; wait for the two-minute reconciliation window.

## Dedicated service endpoints

- `GET /integrations/google/callback`: public OAuth redirect with signed, expiring, single-use state.
- `POST /webhooks/google-business`: Pub/Sub envelope; internal worker credential required.
- `POST /internal/reviews/:id/publish`: versioned Cloud Tasks delivery, authenticated worker only.
- `POST /internal/reviews/purge-expired-google-content`: configured workspace physical expiry purge.
- `POST /internal/reviews/retry-notifications`: configured workspace push outbox retry.
- `POST /webhooks/google-business/demo`: authenticated development-only simulator; unavailable with production/live Google.

These are product/service contracts, not an approved public API for third-party SaaS integrations. Browser requests go through `/api/backend`; `/api/session` manages server-held web sessions, password recovery, email verification and TOTP enrollment/challenge.
