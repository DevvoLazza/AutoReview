# AutoReview implementation continuity

## Snapshot

- Branch: `codex/production-pilot`, based on `dev`.
- Goal: replace demonstration-only paths with a safe, usable manually approved pilot.
- No live Google, OpenRouter or cloud credentials supplied. Never claim production verification without them.

## Current plan

1. Durable tenant-scoped storage, transactional version checks and recoverable workflow.
2. Real authenticated sessions, onboarding and functional web/mobile actions.
3. Google import, notification setup, AI grounding and knowledge management.
4. Deployment configuration, integration/e2e tests and honest English documentation.

## Verification

- Baseline: 16 tests; typechecks pass in seven workspaces.
- Baseline has no database, web or mobile tests. Google/cloud/physical push verification remains external.

## Decisions

- Manual approval remains the default. Automatic publication must fail closed.
- Keep mock adapters explicit and prohibited in production.
- Use small commits. PR target must be `dev`; do not update `main` directly.
