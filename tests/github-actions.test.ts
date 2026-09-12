import assert from "node:assert/strict";
import test from "node:test";

import {
  createSnapshot,
  enrichSignals,
  normalizeRuns,
  parseRepository,
  summarizeJobs,
  type GitHubRepository,
  type GitHubWorkflowRun,
} from "../lib/github-actions.ts";

const now = Date.parse("2026-09-11T18:00:00Z");

const baseRun: GitHubWorkflowRun = {
  id: 101,
  run_number: 18,
  workflow_id: 7,
  name: "Reliability CI",
  head_branch: "main",
  head_sha: "188e66c0a51ac4943bc5b193f1d8af07464f06c4",
  status: "completed",
  conclusion: "failure",
  event: "push",
  run_attempt: 2,
  created_at: "2026-09-11T17:50:00Z",
  run_started_at: "2026-09-11T17:52:00Z",
  updated_at: "2026-09-11T17:57:30Z",
  html_url: "https://github.com/calebponce/RunSignal/actions/runs/101",
  actor: { login: "calebponce" },
  head_commit: { message: "Connect public workflow data\n\nDetails" },
};

test("repository parser accepts names and GitHub URLs without widening the host", () => {
  assert.deepEqual(parseRepository("calebponce/RunSignal"), {
    owner: "calebponce",
    repo: "RunSignal",
    fullName: "calebponce/RunSignal",
  });
  assert.equal(
    parseRepository("https://github.com/calebponce/RunSignal.git")?.fullName,
    "calebponce/RunSignal",
  );
  assert.equal(parseRepository("https://example.com/calebponce/RunSignal"), null);
  assert.equal(parseRepository("calebponce/RunSignal/actions"), null);
});

test("workflow normalization derives reproducibility, queue, and history signals", () => {
  const runs = normalizeRuns(
    [
      baseRun,
      {
        ...baseRun,
        id: 100,
        run_number: 17,
        run_attempt: 1,
        conclusion: "success",
      },
    ],
    now,
  );

  assert.equal(runs[0].status, "failed");
  assert.equal(runs[0].signals.retryOutcome, "failure");
  assert.equal(runs[0].signals.historicalFailureRate, 0.5);
  assert.equal(runs[0].signals.queueDelayMinutes, 2);
  assert.equal(runs[0].message, "Connect public workflow data");
});

test("repository snapshots expose reviewer-friendly reliability metrics", () => {
  const repository: GitHubRepository = {
    name: "RunSignal",
    full_name: "calebponce/RunSignal",
    html_url: "https://github.com/calebponce/RunSignal",
    default_branch: "main",
    private: false,
  };
  const snapshot = createSnapshot(
    repository,
    [baseRun, { ...baseRun, id: 100, conclusion: "success", run_attempt: 1 }],
    { limit: 60, remaining: 54, resetAt: "2026-09-11T19:00:00Z" },
    now,
  );

  assert.equal(snapshot.repository.fullName, "calebponce/RunSignal");
  assert.equal(snapshot.metrics.passRate, 50);
  assert.equal(snapshot.metrics.failed, 1);
  assert.equal(snapshot.metrics.retried, 1);
  assert.deepEqual(snapshot.pulse, [100, 35]);
});

test("commit paths and failed job steps enrich the final diagnosis", () => {
  const normalized = normalizeRuns([baseRun], now)[0];
  const enriched = enrichSignals(
    normalized.signals,
    { files: [{ filename: "app/page.tsx" }, { filename: "README.md" }] },
    { protected: true },
  );
  const jobs = summarizeJobs([
    {
      name: "test",
      conclusion: "failure",
      html_url: "https://github.com/example/job",
      steps: [
        { name: "Install", conclusion: "success" },
        { name: "Run tests", conclusion: "failure" },
      ],
    },
  ]);

  assert.equal(enriched.signals.touchedApplicationCode, true);
  assert.equal(enriched.signals.protectedBranch, true);
  assert.deepEqual(jobs[0].failedSteps, ["Run tests"]);
});
