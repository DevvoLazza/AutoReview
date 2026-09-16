<div align="center">

# AutoReview

### Thoughtful AI replies. Human accountability.

A review operations platform for Google Business Profile, with approved business knowledge, authenticated approval workflows, and conservative automation controls.

[![CI](https://github.com/DevvoLazza/AutoReview/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/DevvoLazza/AutoReview/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-24_LTS-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Expo](https://img.shields.io/badge/Expo-57-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Runnable local demo · Production-oriented pilot · Automation off by default**

</div>

## Overview

AutoReview prepares context-aware replies and keeps publication under application control. An AI model receives the review and relevant approved knowledge; it never receives Google credentials, database access, tools, or permission to publish.

```text
Google review → authenticated event → canonical retrieval → approved knowledge
             → AI draft + independent validation → human approval or eligible rule
             → canonical recheck → publication → confirmation + audit
```

> [!IMPORTANT]
> The application is locally runnable and has real-service adapters, a persistent PostgreSQL repository, and validated infrastructure configuration. A real Google pilot has **not** been verified: Google API approval, service credentials, cloud deployment, and physical-device testing are still required. Local demo mode never publishes to Google.

## Features

- **Review operations:** paginated web/mobile inboxes, manual editing, natural-language revisions, approval, rejection, schedule cancellation, and recovery from uncertain publication.
- **Business knowledge:** tenant/location scoping, source versions, approval and retirement, validity dates, PDF/DOCX/TXT/Markdown extraction, and PostgreSQL full-text plus vector retrieval.
- **Grounded drafting:** structured output, source identifiers visible to approvers, a separate validation request, unsupported-claim detection, and source-version revalidation before sending.
- **Conservative automation:** disabled rules, owner consent and MFA, 20 confirmed manual approvals per location, daily limits, cancellation delay, global kill switch, and an operator-controlled release gate.
- **Sensitive-case escalation:** deterministic risk checks and model validation prevent flagged cases from automatic delivery. Detection is not a guarantee that every sensitive phrase in every language will be recognized; review language/category evaluations remain release requirements.
- **Authenticated access:** Identity Platform email/password and TOTP, web HttpOnly encrypted sessions, native SecureStore sessions, role checks, and live account/revocation verification.
- **Reliable publication:** atomic version checks and persisted intent, canonical Google rereads, confirmation after PUT, and GET-only reconciliation after uncertain outcomes.
- **Private notifications:** content-free push payloads, authenticated deep links, persisted submission retries, invalid-device removal, and an inbox that works without push delivery.
- **Operational safeguards:** forced PostgreSQL RLS, non-owner runtime credentials, KMS-encrypted Google tokens, append-only metadata audit, temporary-content expiry, and Terraform monitoring alerts.

## Quick start

Requires **Node.js 24 LTS** and **pnpm 11.19.0**. No Google project, AI key, Docker installation, or mobile account is needed for the local demo.

```bash
git clone https://github.com/DevvoLazza/AutoReview.git
cd AutoReview
pnpm install --frozen-lockfile
pnpm build
pnpm dev:demo
```

Open **http://localhost:3000**. The launcher explicitly selects simulated Google/AI, demonstration authentication, and volatile in-memory storage. Stop it with `Ctrl+C`; demo data resets when the API restarts.

| Local service | Address |
| --- | --- |
| Dashboard | `http://localhost:3000` |
| REST API | `http://localhost:4100/v1` |
| Swagger UI | `http://localhost:4100/docs` |
| OpenAPI | `http://localhost:4100/openapi.json` |

Simulate an incoming review from PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:4100/v1/webhooks/google-business/demo -ContentType application/json -Body '{}'
```

Open **Recensioni**, inspect its draft and sources, edit or request a revision, then approve. Publication is simulated. API failures show an error and retry action; clients do **not** silently substitute demo data.

For persistent development, authentication, mobile builds, and cloud deployment, follow the [setup guide](docs/setup.md).

## Technology and layout

| Component | Stack |
| --- | --- |
| Dashboard | Next.js 16, React 19, App Router, same-origin server-side API proxy |
| Mobile | Expo SDK 57, React Native 0.86, Expo Router, development builds |
| API / worker | NestJS, Fastify, TypeScript, shared Zod contracts |
| Storage / retrieval | PostgreSQL 17, Drizzle, `pgvector`, Vertex AI embeddings |
| Reply generation | OpenRouter, configured immutable DeepSeek snapshot, JSON Schema |
| Cloud | Cloud Run, Cloud SQL, Pub/Sub, Tasks, Scheduler, Identity Platform, KMS, Secret Manager |
| Delivery / tests | pnpm, Turborepo, Terraform, GitHub Actions, Vitest, PGlite, Playwright |

```text
apps/api/              Authentication, Google onboarding, knowledge, review workflow
apps/worker/           OIDC-verified events, scheduled delivery, retention and push retry
apps/web/              Operations dashboard and encrypted web sessions
apps/mobile/           Authenticated iOS/Android companion app
packages/contracts/    Shared request and domain schemas
packages/core/         AI/Google interfaces, safety policy and automation engine
packages/database/     Runtime repository, retrieval, migrations and isolation tests
infra/terraform/       Dedicated pilot infrastructure
docs/                  Setup, architecture, API, security and release guidance
```

The pilot intentionally accepts **one configured workspace** in production. Storage isolation is multi-tenant by design, but commercial SaaS onboarding, billing, self-service team administration, and third-party integration APIs are not included. User access is provisioned with an administrator CLI. Original uploaded document binaries are not archived; approved extracted text is stored.

## Configuration

See [.env.example](.env.example) and [setup](docs/setup.md). The default reply snapshot is `deepseek/deepseek-v4-pro-0813`; deployments can change it without rewriting clients or knowledge. Evaluate any replacement before release.

Live AI requests require a reviewed provider allowlist and request `zdr: true`, `data_collection: "deny"`, and required-parameter support. Verify actual endpoint eligibility, disable optional OpenRouter prompt logging, and assess processing region and contractual terms. These request settings alone are not proof of EU-only processing or legal compliance.

Production refuses demo adapters, volatile storage, missing secrets, insecure public origins, and privileged database roles. Automatic publication also requires `AUTOMATION_RELEASE_APPROVED=true`, a disabled kill switch, an enabled consented rule, and all safety checks. Leave the release flag **false** throughout the initial pilot.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm --filter @reviewguard/mobile exec expo export --platform android --output-dir dist-android
pnpm --filter @reviewguard/mobile exec expo export --platform ios --output-dir dist-ios
```

Browser tests exercise desktop and mobile web workflows, dynamically imported reviews, knowledge lifecycle, saved settings, and visible failure/retry states. Install Chromium with `pnpm --filter @reviewguard/web exec playwright install chromium` if no supported local browser is available.

Database tests run real PostgreSQL semantics in PGlite/WASM with `pgvector`, including cross-tenant RLS, pooled-context reset, concurrent writes, atomic publication intent, audit immutability, expiry, and hybrid source filtering. Set `TEST_DATABASE_URL` to run the optional TCP PostgreSQL integration check against an **isolated test database**. It is skipped when no test server is supplied.

JavaScript platform exports are build checks—not signed APK/IPA files, physical-device evidence, or store approval. GitHub Actions checks application code, browser workflows, mobile exports, and Terraform formatting/validation; it does not deploy cloud resources.

## Going live

1. Obtain Google Business Profile API access and authorize a real business/location.
2. Provision the dedicated cloud project, migrate the database, configure Identity Platform, and grant users their scoped roles.
3. Verify Google OAuth, canonical reads, authenticated Pub/Sub, provider/ZDR routing, embeddings, and one manually approved publication.
4. Test account revocation, concurrent approval, lost publication responses, retention, alerts, and backup restoration.
5. Validate native authentication, deep links and push on physical iOS/Android devices; complete signing and release requirements.
6. Complete privacy/contractual review and obtain written Google confirmation before expanding to commercial SaaS or automatic client replies.

The detailed [Google go-live checklist](docs/go-live-google.md) distinguishes implemented controls from external acceptance evidence. Google does not provide a full dedicated sandbox; simulated adapters do not replace a controlled real-location pilot.

## Documentation and contribution

- [Setup and deployment](docs/setup.md)
- [Architecture and trust boundaries](docs/architecture.md)
- [API reference](docs/api.md)
- [Engineering security model](docs/security.md)
- [Vulnerability reporting](SECURITY.md)
- [Google pilot acceptance](docs/go-live-google.md)

Branch from `dev`, keep commits focused, and target pull requests at `dev`. `main` is the synchronized release branch. Run the relevant checks before submitting changes. Never commit secrets, `.env` files, Terraform state, or real customer review data.

## License

AutoReview is licensed under the [MIT License](LICENSE). Copyright © 2026 Lazzaro Davide.
