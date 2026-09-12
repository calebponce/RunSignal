# ADR 001: Public GitHub ingestion without credentials

## Status

Accepted for RunSignal 1.1.

## Context

The first portfolio release used representative workflow data so reviewers could exercise every decision path without granting repository access. That made the product reliable to demonstrate, but it did not prove that the normalization boundary could handle a real CI provider.

The public demo must remain free, require no account, request no secrets, and fail safely when an upstream service is unavailable.

## Decision

RunSignal accepts only a GitHub `owner/repository` identifier or a canonical `github.com` repository URL. The server converts that identifier into fixed `api.github.com` paths; users cannot supply a protocol, host, port, or arbitrary upstream URL.

The read-only adapter retrieves a bounded set of public resources:

- repository metadata;
- the latest 20 workflow runs;
- up to 30 completed runs for the selected workflow;
- the selected run's jobs and failed steps;
- its commit file list; and
- branch-protection metadata when GitHub exposes it.

Provider records are normalized into the existing deterministic `TriageInput` contract. Missing dependency-health information stays neutral rather than being guessed. The representative incident set remains available as an explicit fallback.

## Consequences

- Reviewers can analyze real public CI history without OAuth or a personal access token.
- The input boundary is resistant to arbitrary-host SSRF because the upstream origin is fixed in code.
- Anonymous GitHub API limits apply and are visible in the interface.
- Private repositories, durable incident history, signed webhooks, and organization-specific policy remain outside this release.
- Network and rate-limit failures never change the engine's decision rules; the UI falls back to locally normalized evidence and labels that downgrade.
