# RunSignal

[![Reliability CI](https://github.com/calebponce/RunSignal/actions/workflows/reliability-ci.yml/badge.svg)](https://github.com/calebponce/RunSignal/actions/workflows/reliability-ci.yml)
[![Live demo](https://img.shields.io/badge/live-demo-4fd1ff)](https://runsignal-caleb.mheaeduardo.chatgpt.site)

An evidence-first CI reliability console that turns workflow history into explainable release decisions.

RunSignal answers the question behind every red build: **is this a code regression, a flaky test, runner pressure, or an external dependency—and should the release continue?** It normalizes webhook-shaped signals, scores competing causes with deterministic rules, and returns an inspectable `ALLOW`, `HOLD`, or `BLOCK` decision.

> Portfolio status: solo full-stack project by Caleb Ponce. The public experience uses representative CI data and never requests repository access. It demonstrates a production-oriented architecture without claiming live operational coverage.

> **[Open the interactive demo](https://runsignal-caleb.mheaeduardo.chatgpt.site)** — select a run, inspect its evidence, and execute the server-backed analysis without an account or repository token.

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
- Selectable runs covering success, regression, flaky-test, infrastructure, and cancellation states.
- Server-side `POST /api/analyze` endpoint with bounded schema validation.
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
| Edge route | Validates webhook-shaped run signals and returns versioned analysis |
| Deterministic engine | Evidence weighting, classification, confidence, severity, and release policy |
| WebMCP | Exposes the same visible analyze-run journey as a structured browser action |
| Node test suite | Locks regression, flaky-test, infrastructure, dependency, success, and inconclusive contracts |
| Cloudflare Workers runtime | Hosts the full-stack application without paid third-party services |

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

RunSignal was designed and implemented as a solo portfolio project by [Caleb Ponce](https://github.com/calebponce). The repository contains representative data so reviewers can exercise every path without supplying credentials or granting access to private infrastructure.

## Current boundaries

- Repository and workflow data are representative rather than connected to GitHub today.
- The first release evaluates one normalized run at a time; it does not persist incidents.
- Confidence is a transparent rule score, not a statistical probability.
- Production adoption would add signed webhook ingestion, durable event storage, background processing, and organization-specific policy configuration.

## License

Released under the MIT License.
