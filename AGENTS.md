# AutoReview contributor guidance

## Repository layout

AutoReview is a pnpm and Turborepo monorepo:

- `apps/api`: NestJS API and workflow orchestration.
- `apps/worker`: authenticated Pub/Sub and Cloud Tasks handlers.
- `apps/web`: Next.js operations dashboard.
- `apps/mobile`: Expo companion application.
- `packages/contracts`: shared Zod schemas and TypeScript types.
- `packages/core`: provider-independent domain, policy, and integration logic.
- `packages/database`: Drizzle schema, migrations, and PostgreSQL helpers.
- `infra/terraform`: Google Cloud infrastructure.

Keep domain behavior in `packages/core`, transport validation in `packages/contracts`, persistence
in `packages/database`, and application wiring in the relevant app. Apps may depend on packages;
packages must not depend on apps.

## Branching

Develop on `dev`. The `main` branch is the released, synchronized branch. Keep commits focused and
do not commit generated output, credentials, `.env` files, Terraform state, or real customer data.

## Verification

Use Node.js 24 and pnpm 11. Before pushing a change, run:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
```

Add or update tests for behavior changes. Typecheck every affected workspace; a successful bundle
alone is not a substitute for TypeScript validation.

## Security and workflow invariants

- Preserve tenant isolation and parameterize all database input.
- Never expose Google credentials, review content, or access tokens in logs or notifications.
- Keep external events and publication operations idempotent.
- Re-read the canonical Google review immediately before publication.
- Respect optimistic concurrency through `expectedVersion` on review mutations.
- Keep hard stops deterministic and independent from model output.
- Only approved knowledge may influence generated replies.
- Failed asynchronous operations must leave reviews in a recoverable state and produce an audit
  event without storing sensitive payloads.

## Configuration

Document new environment variables in `.env.example`. Production secrets belong in Secret Manager,
and live integrations must fail closed when required configuration is missing. Keep local defaults
explicitly non-production and safe.
