# ADR 002: Verify signed webhooks before integrating release actions

## Context

The first RunSignal release reads public workflow history on demand. A GitHub App would receive push-driven events and could eventually post release recommendations. That path needs an authenticated intake boundary before any event is stored or acted upon.

## Decision

Add a shadow-mode `POST /api/webhooks/github` route. It requires a configured secret, verifies GitHub's `X-Hub-Signature-256` HMAC-SHA256 over the unmodified request bytes, rejects bodies above 1 MiB, validates the delivery ID, and accepts only a well-formed `workflow_run.completed` summary. The route returns an acknowledgement and performs no persistent or external action.

The signature implementation is checked against [GitHub's published test vector](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries). Tests also cover tampering, missing configuration, malformed deliveries, and both declared and actual oversized bodies.

## Consequences and next gate

This route is a security boundary, not a usable release gate. A signed redelivery can be acknowledged repeatedly because there is no durable delivery ledger yet. Before enabling analysis or GitHub Checks, add storage with a unique delivery ID, retention policy, background processing, installation-scoped authorization, and tests for duplicate and out-of-order events. Keep all Checks output advisory until that path is verified against a dedicated test repository.
