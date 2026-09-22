import type { TriageInput } from "./triage-engine";

export type RunStatus = "passed" | "failed" | "cancelled";

export type GitHubRateLimit = {
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
};

export type GitHubWorkflowRun = {
  id: number;
  run_number: number;
  workflow_id: number;
  name: string | null;
  head_branch: string | null;
  head_sha: string;
  status: string | null;
  conclusion: string | null;
  event: string;
  run_attempt: number | null;
  created_at: string;
  run_started_at: string | null;
  updated_at: string;
  html_url: string;
  actor: { login: string } | null;
  head_commit: { message: string } | null;
};

export type GitHubRepository = {
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
  private: boolean;
};

export type GitHubCommit = {
  files?: Array<{ filename: string }>;
};

export type GitHubBranch = {
  protected?: boolean;
};

export type GitHubJob = {
  name: string;
  conclusion: string | null;
  html_url: string;
  steps?: Array<{
    name: string;
    conclusion: string | null;
  }>;
};

export type PublicWorkflowRun = {
  id: number;
  runNumber: number;
  workflow: string;
  branch: string;
  commit: string;
  message: string;
  actor: string;
  status: RunStatus;
  conclusion: string;
  duration: string;
  durationSeconds: number;
  finished: string;
  createdAt: string;
  completedAt: string;
  runAttempt: number;
  htmlUrl: string;
  signals: TriageInput;
};

export type RepositorySnapshot = {
  repository: {
    name: string;
    fullName: string;
    htmlUrl: string;
    defaultBranch: string;
  };
  runs: PublicWorkflowRun[];
  metrics: {
    passRate: number;
    completed: number;
    failed: number;
    retried: number;
    medianDurationSeconds: number;
    medianQueueMinutes: number;
  };
  pulse: number[];
  fetchedAt: string;
  rateLimit: GitHubRateLimit;
};

const terminalSuccess = new Set(["success"]);
const terminalCancelled = new Set(["cancelled", "neutral", "skipped"]);
const applicationPathPattern = /^(app|apps|src|lib|server|api|packages)\//i;

export class GitHubApiError extends Error {
  readonly status: number;
  readonly rateLimit: GitHubRateLimit;

  constructor(
    status: number,
    message: string,
    rateLimit: GitHubRateLimit,
  ) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.rateLimit = rateLimit;
  }
}

export function parseRepository(value: string) {
  const cleaned = value
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/$/, "");
  const match = cleaned.match(
    /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]{1,100})$/,
  );

  if (!match) return null;
  return { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` };
}

function numberHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readRateLimit(headers: Headers): GitHubRateLimit {
  const reset = numberHeader(headers, "x-ratelimit-reset");
  return {
    limit: numberHeader(headers, "x-ratelimit-limit"),
    remaining: numberHeader(headers, "x-ratelimit-remaining"),
    resetAt: reset ? new Date(reset * 1000).toISOString() : null,
  };
}

export async function fetchGitHubJson<T>(path: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "RunSignal/1.1",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  const rateLimit = readRateLimit(response.headers);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    const fallback =
      response.status === 404
        ? "The repository or workflow run was not found. RunSignal only reads public repositories."
        : response.status === 403 && rateLimit.remaining === 0
          ? "GitHub's public API limit is temporarily exhausted. Try again after the reset time."
          : "GitHub could not provide this repository right now.";
    throw new GitHubApiError(response.status, payload?.message || fallback, rateLimit);
  }

  return {
    data: (await response.json()) as T,
    rateLimit,
  };
}

function outcomeFor(conclusion: string | null): TriageInput["outcome"] {
  if (conclusion && terminalSuccess.has(conclusion)) return "success";
  if (!conclusion || terminalCancelled.has(conclusion)) return "cancelled";
  return "failure";
}

function statusFor(conclusion: string | null): RunStatus {
  const outcome = outcomeFor(conclusion);
  return outcome === "success"
    ? "passed"
    : outcome === "failure"
      ? "failed"
      : "cancelled";
}

function secondsBetween(start: string | null, end: string) {
  if (!start) return 0;
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000));
}

function minutesBetween(start: string, end: string | null) {
  if (!end) return 0;
  return Math.max(0, Math.round(((Date.parse(end) - Date.parse(start)) / 60000) * 10) / 10);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function formatDuration(totalSeconds: number) {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function formatAge(timestamp: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Date.parse(timestamp)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function normalizeRuns(rawRuns: GitHubWorkflowRun[], now = Date.now()) {
  const queueSamples = rawRuns
    .map((run) => minutesBetween(run.created_at, run.run_started_at))
    .filter((value) => value >= 0);
  const baselineQueueMinutes = Math.max(1, Math.round(median(queueSamples) * 10) / 10);

  return rawRuns.map<PublicWorkflowRun>((run) => {
    const peers = rawRuns.filter(
      (candidate) =>
        candidate.id !== run.id &&
        candidate.workflow_id === run.workflow_id &&
        candidate.head_branch === run.head_branch &&
        candidate.conclusion,
    );
    const failedPeers = peers.filter(
      (candidate) => outcomeFor(candidate.conclusion) === "failure",
    ).length;
    const durationSeconds = secondsBetween(run.run_started_at, run.updated_at);
    const runAttempt = Math.max(1, run.run_attempt ?? 1);
    const outcome = outcomeFor(run.conclusion);

    return {
      id: run.id,
      runNumber: run.run_number,
      workflow: run.name || "GitHub Actions",
      branch: run.head_branch || "detached",
      commit: run.head_sha.slice(0, 7),
      message: run.head_commit?.message.split("\n")[0] || run.name || "Workflow run",
      actor: run.actor?.login || "github-actions",
      status: statusFor(run.conclusion),
      conclusion: run.conclusion || run.status || "unknown",
      duration: formatDuration(durationSeconds),
      durationSeconds,
      finished: formatAge(run.updated_at, now),
      createdAt: run.created_at,
      completedAt: run.updated_at,
      runAttempt,
      htmlUrl: run.html_url,
      signals: {
        runId: run.id,
        outcome,
        // run_attempt tells us a rerun happened, but this response contains
        // only the current attempt's conclusion. Earlier outcomes are unknown.
        retryOutcome: runAttempt > 1 ? "unknown" : "not-run",
        historicalFailureRate: peers.length ? failedPeers / peers.length : 0,
        queueDelayMinutes: minutesBetween(run.created_at, run.run_started_at),
        baselineQueueMinutes,
        dependencyHealth: "healthy",
        touchedApplicationCode: false,
        protectedBranch: false,
      },
    };
  });
}

export function createSnapshot(
  repository: GitHubRepository,
  rawRuns: GitHubWorkflowRun[],
  rateLimit: GitHubRateLimit,
  now = Date.now(),
): RepositorySnapshot {
  const runs = normalizeRuns(rawRuns, now);
  const completed = runs.filter((run) => run.conclusion !== "unknown");
  const passed = completed.filter((run) => run.status === "passed").length;
  const failed = completed.filter((run) => run.status === "failed").length;
  const durations = completed
    .map((run) => run.durationSeconds)
    .filter((value) => value > 0);
  const queues = completed.map((run) => run.signals.queueDelayMinutes);

  return {
    repository: {
      name: repository.name,
      fullName: repository.full_name,
      htmlUrl: repository.html_url,
      defaultBranch: repository.default_branch,
    },
    runs,
    metrics: {
      passRate: completed.length ? Math.round((passed / completed.length) * 1000) / 10 : 0,
      completed: completed.length,
      failed,
      retried: runs.filter((run) => run.runAttempt > 1).length,
      medianDurationSeconds: Math.round(median(durations)),
      medianQueueMinutes: Math.round(median(queues) * 10) / 10,
    },
    pulse: runs
      .slice(0, 12)
      .reverse()
      .map((run) =>
        run.status === "passed" ? 100 : run.status === "failed" ? 35 : 58,
      ),
    fetchedAt: new Date(now).toISOString(),
    rateLimit,
  };
}

export function enrichSignals(
  signals: TriageInput,
  commit: GitHubCommit,
  branch: GitHubBranch | null,
) {
  const changedFiles = (commit.files || []).map((file) => file.filename);
  return {
    signals: {
      ...signals,
      touchedApplicationCode: changedFiles.some((path) =>
        applicationPathPattern.test(path),
      ),
      protectedBranch: branch?.protected === true,
    },
    changedFiles,
  };
}

export function summarizeJobs(jobs: GitHubJob[]) {
  return jobs
    .filter((job) => job.conclusion && job.conclusion !== "success")
    .map((job) => ({
      name: job.name,
      conclusion: job.conclusion,
      htmlUrl: job.html_url,
      failedSteps: (job.steps || [])
        .filter((step) => step.conclusion && step.conclusion !== "success")
        .map((step) => step.name),
    }));
}
