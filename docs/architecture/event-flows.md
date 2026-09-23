# RunSignal event flows and release-authority boundary

RunSignal has two separate GitHub-facing paths. Neither path currently changes a GitHub check, deployment, branch rule, or release.

| Path | What enters | What is retained | What the response means |
| --- | --- | --- | --- |
| Public GitHub read (`GET`/`POST /api/github`) | A public repository name and, for analysis, a run ID. The server fetches bounded GitHub Actions resources from a fixed API origin. | No durable incident record in this application. The browser can show representative incidents when live history is unavailable. | A deterministic `ALLOW`, `HOLD`, or `BLOCK` **recommendation** based on normalized evidence; no GitHub-side action. |
| Signed intake (`POST /api/webhooks/github`) without D1 | A signed `workflow_run.completed` payload, after HMAC, size, delivery-ID, and shape checks. | Nothing. | `validated` in shadow mode; no analysis or release decision. |
| Signed intake with an explicitly configured D1 binding | The same validated delivery. | Delivery ID, payload hash, repository, run ID, and receipt timestamp. No raw payload or decision history. | `recorded`, `duplicate`, or an error; still no analysis or release decision. |

The [public ingestion adapter](../../app/api/github/route.ts) calls the [deterministic engine](../../lib/triage-engine.ts). The [webhook route](../../app/api/webhooks/github/route.ts) instead calls the [signed intake boundary](../../lib/github-webhook.ts) and optional [delivery store](../../lib/webhook-delivery-store.ts). These paths do not feed one another. A webhook acknowledgement must not be described as an analyzed incident, a durable decision, or an enforced gate.

## Failure and ordering behavior

- Public GitHub reads can fail or be rate-limited. The UI labels its representative-data fallback; that fallback is not live repository evidence.
- Invalid or oversized webhook bodies are rejected before ledger storage. With a configured ledger, storage failure returns `503` rather than silently falling back to non-persistent shadow mode.
- The unique delivery ID and payload hash distinguish a repeated identical delivery from an ID reused with different bytes. Tests cover this in memory, the generated migration in local SQLite, and replay after closing and reopening a local SQLite file. They do **not** prove behavior against a provisioned Cloudflare D1 database or real GitHub redelivery.
- The ledger records receipt, not workflow-state transitions. It currently has no out-of-order event policy. Later analysis must not assume delivery order matches run order or that every event arrives exactly once.
- The ledger has no retention job or bounded history. Do not enable it for ongoing operational use without an explicit retention policy and storage/volume checks.

## Gate before operational use

Provision a dedicated test repository and D1 binding; apply the migration; exercise real signed redelivery, restart, failure, and out-of-order cases; define retention and installation-scoped authorization; persist inspectable decisions separately from receipts; and only then consider advisory GitHub Checks with dry-run and rollback controls. The public [hosting configuration](../../.openai/hosting.json) sets `d1` to `null`; the public demo remains read-only/shadow mode.
