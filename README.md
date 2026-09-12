# RunSignal

[![Reliability CI](https://github.com/calebponce/RunSignal/actions/workflows/reliability-ci.yml/badge.svg)](https://github.com/calebponce/RunSignal/actions/workflows/reliability-ci.yml)
[![Live demo](https://img.shields.io/badge/live-demo-4fd1ff)](https://runsignal-caleb.mheaeduardo.chatgpt.site)

An evidence-first CI reliability console that turns workflow history into explainable release decisions.

RunSignal answers the question behind every red build: **is this a code regression, a flaky test, runner pressure, or an external dependency—and should the release continue?** It normalizes webhook-shaped signals, scores competing causes with deterministic rules, and returns an inspectable `ALLOW`, `HOLD`, or `BLOCK` decision.

> Portfolio status: solo full-stack project by Caleb Ponce. The public experience reads real GitHub Actions history for public repositories without OAuth or stored credentials, with representative data retained as a resilient fallback.

> **[Open the interactive demo](https://runsignal-caleb.mheaeduardo.chatgpt.site)** — enter any public `owner/repository`, load its latest workflow runs, and execute a server-backed analysis without an account or repository token.

## Why this project exists

Build dashboards usually report that a run failed. RunSignal focuses on the decision that follows:

- Reproducible failures after application-code changes point toward a regression.
- Successful retries plus historical instability point toward a flaky test.
- Abnormal runner queues point toward infrastructure pressure.
- Provider health signals can isolate an external dependency incident.
- Protected branches block only when the evidence supports that policy.

The engine stays deterministic. AI may eventually summarize a result, but it cannot change the evidence score or release decision.

## Working product

- Interactive reliability workspace with health metrics and run history.
- Read-only GitHub integration for real public repository, workflow, job, commit, retry, queue, and branch-protection evidence.
- Selectable runs covering success, regression, flaky-test, infrastructure, and cancellation states.
- Server-side `GET` and `POST /api/github` endpoints with bounded repository and run validation.
- Explicit GitHub API rate-limit, missing-repository, empty-history, and local-fallback states.
- Original `POST /api/analyze` contract remains available for normalized webhook-shaped signals.
- Pure triage engine shared by the interface and API.
- Graceful browser fallback if the analysis endpoint is unavailable.
- WebMCP action for selecting and analyzing a representative workflow run.
- Responsive layout with keyboard-visible controls and reduced-motion support.

## Deterministic decision flow

1. Normalize outcome, retry, historical failure rate, queue delay, dependency health, changed paths, and branch protection.
2. Score the four competing incident causes.
3. Select the strongest supported verdict and expose every contributing signal.
4. Enforce `ALLOW`, `HOLD`, or `BLOCK` independently of narrative generation.

## Architecture

| Layer | Responsibility |
| --- | --- |
| React + Vinext | Interactive operations console and accessible state transitions |
| GitHub REST adapter | Reads public workflow, job, commit, retry, queue, and branch metadata without a user token |
| Edge route | Validates webhook-shaped run signals and returns versioned analysis |
| Deterministic engine | Evidence weighting, classification, confidence, severity, and release policy |
| WebMCP | Exposes the same visible analyze-run journey as a structured browser action |
| Node test suite | Locks regression, flaky-test, infrastructure, dependency, success, and inconclusive contracts |
| Cloudflare Workers runtime | Hosts the full-stack application without paid third-party services |

The provider-boundary tradeoffs are documented in [ADR 001: Public GitHub ingestion without credentials](docs/decisions/001-public-github-ingestion.md).

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`.

## Verify

```bash
npm test
npm run lint
npm run build
```

## API example

Load recent runs from a public repository:

```http
GET /api/github?repository=calebponce%2FRunSignal
```

Enrich and analyze one loaded workflow run:

```http
POST /api/github
Content-Type: application/json
```

```json
{
  "repository": "calebponce/RunSignal",
  "runId": 123456789
}
```

The response includes the deterministic analysis plus changed-file, failed-job, failed-step, branch-protection, and rate-limit diagnostics. RunSignal never accepts arbitrary upstream hosts; repository input is normalized into a fixed `api.github.com` request path.

The original normalized-signal contract is also available:

```http
POST /api/analyze
Content-Type: application/json
```

```json
{
  "runId": 1842,
  "outcome": "failure",
  "retryOutcome": "failure",
  "historicalFailureRate": 0.02,
  "queueDelayMinutes": 2,
  "baselineQueueMinutes": 2,
  "dependencyHealth": "healthy",
  "touchedApplicationCode": true,
  "protectedBranch": true
}
```

The response includes the verdict, severity, confidence, release decision, recommended action, ordered evidence, and complete scorecard.

## Ownership

RunSignal was designed and implemented as a solo portfolio project by [Caleb Ponce](https://github.com/calebponce). Reviewers can inspect real public workflows or restore the representative incident set to exercise failure paths that are not present in a healthy repository.

## Current boundaries

- GitHub ingestion is intentionally read-only and limited to public repositories.
- Anonymous GitHub API rate limits apply; the interface reports the remaining request budget and preserves the demo fallback.
- GitHub Actions does not provide third-party dependency health, so that signal remains neutral unless supplied through the normalized API contract.
- The first release evaluates one normalized run at a time; it does not persist incidents.
- Confidence is a transparent rule score, not a statistical probability.
- Production adoption would add signed webhook ingestion, durable event storage, background processing, authenticated private-repository access, and organization-specific policy configuration.

## License

Released under the MIT License.
