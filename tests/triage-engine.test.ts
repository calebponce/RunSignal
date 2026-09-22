import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeRun,
  type ReleasePolicy,
  type TriageInput,
} from "../lib/triage-engine.ts";

const base: TriageInput = {
  runId: 1842,
  outcome: "failure",
  retryOutcome: "failure",
  historicalFailureRate: 0.02,
  queueDelayMinutes: 2,
  baselineQueueMinutes: 2,
  dependencyHealth: "healthy",
  touchedApplicationCode: true,
  protectedBranch: true,
};

test("reproduced protected-branch failures block the release", () => {
  const result = analyzeRun(base);
  assert.equal(result.verdict, "code-regression");
  assert.equal(result.releaseDecision, "BLOCK");
  assert.equal(result.severity, "critical");
});

test("successful retries plus history identify flaky tests", () => {
  const result = analyzeRun({
    ...base,
    retryOutcome: "success",
    historicalFailureRate: 0.42,
    touchedApplicationCode: false,
  });
  assert.equal(result.verdict, "flaky-test");
  assert.equal(result.releaseDecision, "HOLD");
});

test("queue pressure outranks other infrastructure-neutral signals", () => {
  const result = analyzeRun({
    ...base,
    retryOutcome: "not-run",
    queueDelayMinutes: 18,
    baselineQueueMinutes: 2,
    touchedApplicationCode: false,
  });
  assert.equal(result.verdict, "infrastructure");
});

test("dependency outages produce a provider verdict", () => {
  const result = analyzeRun({
    ...base,
    retryOutcome: "not-run",
    dependencyHealth: "outage",
    touchedApplicationCode: false,
  });
  assert.equal(result.verdict, "external-dependency");
});

test("successful runs are allowed and cancelled runs stay on hold", () => {
  assert.equal(
    analyzeRun({ ...base, outcome: "success", retryOutcome: "not-run" })
      .releaseDecision,
    "ALLOW",
  );
  assert.equal(
    analyzeRun({ ...base, outcome: "cancelled", retryOutcome: "not-run" })
      .releaseDecision,
    "HOLD",
  );
});

test("unexplained failures remain inconclusive instead of guessing", () => {
  const result = analyzeRun({
    ...base,
    retryOutcome: "not-run",
    touchedApplicationCode: false,
  });
  assert.equal(result.verdict, "inconclusive");
  assert.equal(result.releaseDecision, "HOLD");
});

test("workflow history alone cannot diagnose a flaky test", () => {
  const result = analyzeRun({
    ...base,
    retryOutcome: "not-run",
    historicalFailureRate: 0.8,
    touchedApplicationCode: false,
  });
  assert.equal(result.verdict, "inconclusive");
  assert.equal(result.releaseDecision, "HOLD");
});

test("application path changes alone cannot block by default", () => {
  const result = analyzeRun({
    ...base,
    retryOutcome: "not-run",
  });
  assert.equal(result.verdict, "code-regression");
  assert.equal(result.releaseDecision, "HOLD");
  assert.match(result.policyEvaluation.decisionReason, /requires a reproduced failure/);
  assert.match(result.evidence[0].detail, /unverified/);
});

test("policy thresholds can hold a supported regression without changing diagnosis evidence", () => {
  const strictPolicy: ReleasePolicy = {
    protectedBranchRegression: "BLOCK",
    blockConfidenceFloor: 95,
    requireReproducedFailureForBlock: false,
  };

  const defaultResult = analyzeRun(base);
  const strictResult = analyzeRun(base, strictPolicy);

  assert.equal(defaultResult.releaseDecision, "BLOCK");
  assert.equal(strictResult.verdict, "code-regression");
  assert.equal(strictResult.releaseDecision, "HOLD");
  assert.deepEqual(strictResult.scorecard, defaultResult.scorecard);
  assert.match(strictResult.policyEvaluation.decisionReason, /below the 95% block threshold/);
});

test("a reproduced-failure policy keeps unverified regression signals on hold", () => {
  const result = analyzeRun(
    {
      ...base,
      retryOutcome: "not-run",
    },
    {
      protectedBranchRegression: "BLOCK",
      blockConfidenceFloor: 0,
      requireReproducedFailureForBlock: true,
    },
  );

  assert.equal(result.verdict, "code-regression");
  assert.equal(result.releaseDecision, "HOLD");
  assert.match(result.policyEvaluation.decisionReason, /requires a reproduced failure/);
});

test("a hold policy never changes the diagnosis or scorecard", () => {
  const defaultResult = analyzeRun(base);
  const result = analyzeRun(base, {
    protectedBranchRegression: "HOLD",
    blockConfidenceFloor: 0,
    requireReproducedFailureForBlock: false,
  });

  assert.equal(result.verdict, "code-regression");
  assert.equal(result.releaseDecision, "HOLD");
  assert.deepEqual(result.scorecard, defaultResult.scorecard);
  assert.match(result.policyEvaluation.decisionReason, /holds protected-branch regressions/);
});
