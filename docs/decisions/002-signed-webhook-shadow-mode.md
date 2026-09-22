# ADR 002: Verify signed webhooks before integrating release actions

## Context

The first RunSignal release reads public workflow history on demand. A GitHub App would receive push-driven events and could eventually post release recommendations. That path needs an authenticated intake boundary before any event is stored or acted upon.

## Decision

Add a shadow-mode `POST /api/webhooks/github` route. It requires a configured secret, verifies GitHub's `X-Hub-Signature-256` HMAC-SHA256 over the unmodified request bytes, rejects bodies above 1 MiB, validates the delivery ID, and accepts only a well-formed `workflow_run.completed` summary. Without a D1 binding, the route returns an acknowledgement and performs no persistent or external action.

An optional D1 adapter now persists a minimal delivery ledger after validation: delivery ID (unique), payload SHA-256, repository, run ID, and receipt time. It uses an atomic `INSERT OR IGNORE` against the unique key, then distinguishes an identical redelivery (`200 duplicate`) from an ID reused with different bytes (`409`). A configured store failure returns `503`. No raw webhook payload is persisted. The generated migration lives in [`drizzle/0000_steep_tomas.sql`](../../drizzle/0000_steep_tomas.sql).

The signature implementation is checked against [GitHub's published test vector](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries). Tests also cover tampering, missing configuration, malformed deliveries, both declared and actual oversized bodies, duplicate/conflicting deliveries, configured-store failure, and execution of the migration in local SQLite. The D1 API is mocked in unit tests; a provisioned D1 has not been integration-tested.

## Consequences and next gate

This route is a security boundary, not a usable release gate. The public site's `d1` setting remains `null`, so its current behavior is still non-persistent shadow mode. The optional ledger only deduplicates completed-run deliveries when an operator explicitly provisions D1, applies the migration, and supplies a webhook secret. It has no retention policy, out-of-order processing, background jobs, or installation-scoped authorization. Before enabling analysis or GitHub Checks, add those controls and verify them against a dedicated test repository. Keep all Checks output advisory until then.
