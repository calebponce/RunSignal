"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FolderGit2,
  GitBranch,
  GitCommit,
  LayoutDashboard,
  ListChecks,
  RefreshCw,
  RadioTower,
  ShieldCheck,
  TimerReset,
  WifiOff,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  analyzeRun,
  type TriageInput,
  type TriageResult,
} from "@/lib/triage-engine";
import type {
  RepositorySnapshot,
} from "@/lib/github-actions";

type RunStatus = "passed" | "failed" | "cancelled";

type Run = {
  id: number;
  runNumber?: number;
  workflow?: string;
  branch: string;
  commit: string;
  message: string;
  actor: string;
  status: RunStatus;
  duration: string;
  finished: string;
  conclusion?: string;
  durationSeconds?: number;
  createdAt?: string;
  completedAt?: string;
  runAttempt?: number;
  htmlUrl?: string;
  signals: TriageInput;
};

const demoRuns: Run[] = [
  {
    id: 1842,
    branch: "main",
    commit: "4d8f2c1",
    message: "Harden payment retry policy",
    actor: "Maya Chen",
    status: "failed",
    duration: "7m 42s",
    finished: "4 min ago",
    signals: {
      runId: 1842,
      outcome: "failure",
      retryOutcome: "failure",
      historicalFailureRate: 0.02,
      queueDelayMinutes: 2,
      baselineQueueMinutes: 2,
      dependencyHealth: "healthy",
      touchedApplicationCode: true,
      protectedBranch: true,
    },
  },
  {
    id: 1841,
    branch: "main",
    commit: "a91cd70",
    message: "Cache catalog lookups",
    actor: "Theo Martin",
    status: "passed",
    duration: "5m 18s",
    finished: "38 min ago",
    signals: {
      runId: 1841,
      outcome: "success",
      retryOutcome: "not-run",
      historicalFailureRate: 0.01,
      queueDelayMinutes: 1,
      baselineQueueMinutes: 2,
      dependencyHealth: "healthy",
      touchedApplicationCode: true,
      protectedBranch: true,
    },
  },
  {
    id: 1840,
    branch: "feat/tax-region",
    commit: "337af02",
    message: "Add regional tax mapping",
    actor: "Priya Nair",
    status: "failed",
    duration: "9m 04s",
    finished: "1h ago",
    signals: {
      runId: 1840,
      outcome: "failure",
      retryOutcome: "success",
      historicalFailureRate: 0.42,
      queueDelayMinutes: 2,
      baselineQueueMinutes: 2,
      dependencyHealth: "healthy",
      touchedApplicationCode: false,
      protectedBranch: false,
    },
  },
  {
    id: 1839,
    branch: "main",
    commit: "c65be21",
    message: "Update checkout telemetry",
    actor: "Maya Chen",
    status: "failed",
    duration: "5m 06s",
    finished: "2h ago",
    signals: {
      runId: 1839,
      outcome: "failure",
      retryOutcome: "not-run",
      historicalFailureRate: 0.03,
      queueDelayMinutes: 18,
      baselineQueueMinutes: 2,
      dependencyHealth: "healthy",
      touchedApplicationCode: false,
      protectedBranch: true,
    },
  },
  {
    id: 1838,
    branch: "dependabot/zod",
    commit: "019dbf4",
    message: "Bump validation runtime",
    actor: "dependabot",
    status: "cancelled",
    duration: "1m 12s",
    finished: "3h ago",
    signals: {
      runId: 1838,
      outcome: "cancelled",
      retryOutcome: "not-run",
      historicalFailureRate: 0.01,
      queueDelayMinutes: 2,
      baselineQueueMinutes: 2,
      dependencyHealth: "healthy",
      touchedApplicationCode: false,
      protectedBranch: false,
    },
  },
];

const demoPulse = [82, 88, 91, 78, 94, 90, 87, 96, 92, 74, 89, 67];

const windowMetrics = {
  "24h": { passRate: "91.7%", delta: "↓ 3.1%", recovery: "18m", flaky: 3 },
  "7d": { passRate: "94.2%", delta: "↑ 0.8%", recovery: "22m", flaky: 7 },
  "30d": { passRate: "96.1%", delta: "↑ 1.5%", recovery: "24m", flaky: 11 },
};

const statusIcon = {
  passed: CheckCircle2,
  failed: XCircle,
  cancelled: TimerReset,
};

type ModelContextLike = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => Promise<Record<string, unknown>>;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};

export default function Home() {
  const [windowSize, setWindowSize] = useState("24h");
  const [runs, setRuns] = useState<Run[]>(demoRuns);
  const [selectedId, setSelectedId] = useState(1842);
  const [analysis, setAnalysis] = useState<TriageResult>(() =>
    analyzeRun(demoRuns[0].signals),
  );
  const [analysisState, setAnalysisState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [dataMode, setDataMode] = useState<"demo" | "github">("demo");
  const [repositoryInput, setRepositoryInput] = useState("calebponce/RunSignal");
  const [sourceState, setSourceState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [sourceMessage, setSourceMessage] = useState(
    "Enter any public repository with GitHub Actions enabled.",
  );
  const [analysisNote, setAnalysisNote] = useState("");
  const [repository, setRepository] = useState({
    name: "Checkout API",
    fullName: "northstar/checkout-api",
    htmlUrl: "",
  });
  const [snapshot, setSnapshot] = useState<RepositorySnapshot | null>(null);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedId) ?? runs[0],
    [runs, selectedId],
  );
  const SelectedStatusIcon = statusIcon[selectedRun.status];
  const demoMetrics = windowMetrics[windowSize as keyof typeof windowMetrics];
  const activePulse =
    dataMode === "github" && snapshot?.pulse.length
      ? snapshot.pulse
      : demoPulse;
  const pulseRuns =
    dataMode === "github" ? [...runs].slice(0, 12).reverse() : [];
  const failedRunCount = runs.filter((run) => run.status === "failed").length;
  const stableRunCount = runs.filter((run) => run.status === "passed").length;

  const loadRepository = useCallback(async (repositoryValue: string) => {
    setSourceState("loading");
    setSourceMessage("Reading public workflow history from GitHub…");

    try {
      const response = await fetch(
        `/api/github?repository=${encodeURIComponent(repositoryValue)}`,
      );
      const payload = (await response.json()) as RepositorySnapshot & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || "GitHub could not load this repository.");
      }
      if (!payload.runs.length) {
        throw new Error(
          "This repository has no visible GitHub Actions runs yet. Try another public repository.",
        );
      }

      const firstRun = payload.runs[0];
      setRuns(payload.runs);
      setSelectedId(firstRun.id);
      setAnalysis(analyzeRun(firstRun.signals));
      setAnalysisState("idle");
      setAnalysisNote("");
      setDataMode("github");
      setRepository(payload.repository);
      setSnapshot(payload);
      setRepositoryInput(payload.repository.fullName);
      setSourceState("ready");
      setSourceMessage(
        `Loaded ${payload.runs.length} real runs · ${payload.rateLimit.remaining ?? "—"} GitHub requests remaining`,
      );
    } catch (error) {
      setSourceState("error");
      setSourceMessage(
        error instanceof Error
          ? error.message
          : "GitHub could not load this repository.",
      );
    }
  }, []);

  const showDemo = useCallback(() => {
    setRuns(demoRuns);
    setSelectedId(demoRuns[0].id);
    setAnalysis(analyzeRun(demoRuns[0].signals));
    setAnalysisState("idle");
    setAnalysisNote("");
    setDataMode("demo");
    setRepository({
      name: "Checkout API",
      fullName: "northstar/checkout-api",
      htmlUrl: "",
    });
    setSnapshot(null);
    setSourceState("idle");
    setSourceMessage("Demo data restored. Enter a public repository when ready.");
  }, []);

  const analyzeById = useCallback(async (runId: number) => {
    const run = runs.find((candidate) => candidate.id === runId);
    if (!run) throw new Error(`Run ${runId} is not available.`);

    setSelectedId(run.id);
    setAnalysisState("loading");
    setAnalysisNote("");

    try {
      const response = await fetch(dataMode === "github" ? "/api/github" : "/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          dataMode === "github"
            ? { repository: repository.fullName, runId: run.id }
            : run.signals,
        ),
      });
      const payload = (await response.json()) as {
        analysis?: TriageResult;
        message?: string;
        diagnostics?: {
          changedFileCount: number;
          failedJobs: Array<{
            name: string;
            failedSteps: string[];
          }>;
        };
      };

      if (!response.ok || !payload.analysis) {
        throw new Error(payload.message || "The triage service rejected this run.");
      }

      setAnalysis(payload.analysis);
      setAnalysisState("ready");
      if (dataMode === "github" && payload.diagnostics) {
        const failedJob = payload.diagnostics.failedJobs[0];
        setAnalysisNote(
          failedJob
            ? `GitHub evidence: ${failedJob.name}${failedJob.failedSteps[0] ? ` · ${failedJob.failedSteps[0]}` : ""}`
            : `GitHub evidence: ${payload.diagnostics.changedFileCount} changed files · no failed job reported`,
        );
      }
      return payload.analysis;
    } catch (error) {
      const fallback = analyzeRun(run.signals);
      setAnalysis(fallback);
      setAnalysisState("error");
      setAnalysisNote(
        error instanceof Error
          ? `${error.message} Showing the locally normalized result.`
          : "Showing the locally normalized result.",
      );
      return fallback;
    }
  }, [dataMode, repository.fullName, runs]);

  useEffect(() => {
    const context = (
      document as Document & { modelContext?: ModelContextLike }
    ).modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: "analyze_workflow_run",
          title: "Analyze workflow run",
          description:
            "Select and analyze one workflow run currently visible in RunSignal using deterministic evidence rules.",
          inputSchema: {
            type: "object",
            properties: {
              runId: { type: "number", enum: runs.map((run) => run.id) },
            },
            required: ["runId"],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: dataMode === "github",
          },
          async execute(input) {
            const runId = (input as { runId?: unknown })?.runId;
            if (
              typeof runId !== "number" ||
              !runs.some((run) => run.id === runId)
            ) {
              throw new Error("Choose a run ID currently visible in RunSignal.");
            }

            const result = await analyzeById(runId);
            return {
              runId,
              verdict: result.verdict,
              confidence: result.confidence,
              releaseDecision: result.releaseDecision,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [analyzeById, dataMode, runs]);

  return (
    <div className="console-shell">
      <aside className="workspace-rail" aria-label="Primary navigation">
        <a className="brand-lockup" href="#top" aria-label="RunSignal home">
          <span className="brand-mark">R/</span>
          <span>
            <strong>RunSignal</strong>
            <small>Delivery intelligence</small>
          </span>
        </a>

        <nav className="rail-nav">
          <a className="nav-item is-active" href="#overview">
            <LayoutDashboard aria-hidden="true" />
            Overview
          </a>
          <a className="nav-item" href="#runs">
            <ListChecks aria-hidden="true" />
            Runs
            <span className="nav-count">{runs.length}</span>
          </a>
          <a className="nav-item" href="#incident">
            <RadioTower aria-hidden="true" />
            Incidents
            <span className={`nav-count ${failedRunCount ? "is-alert" : ""}`}>
              {failedRunCount}
            </span>
          </a>
          <a className="nav-item" href="#rules">
            <ShieldCheck aria-hidden="true" />
            Rules
          </a>
        </nav>

        <div className="rail-foot">
          <span className="demo-label">
            {dataMode === "github" ? "Public GitHub data" : "Representative data"}
          </span>
          <p>
            {dataMode === "github"
              ? "Read-only workflow evidence. No sign-in or token requested."
              : "Interactive fallback data for evaluating every decision path."}
          </p>
          <a
            href="https://github.com/calebponce"
            target="_blank"
            rel="noreferrer"
          >
            Caleb Ponce <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
      </aside>

      <div className="console-canvas" id="top">
        <header className="topbar">
          <div className="repo-context">
            <span className="eyebrow">Repository</span>
            <div className="repo-static">
              <GitBranch aria-hidden="true" />
              <strong>{repository.fullName}</strong>
              <span>{dataMode === "github" ? "public" : "demo"}</span>
            </div>
          </div>

          <div className="topbar-actions">
            {repository.htmlUrl ? (
              <a
                className="github-link"
                href={repository.htmlUrl}
                target="_blank"
                rel="noreferrer"
              >
                <FolderGit2 aria-hidden="true" /> View repository
                <ArrowUpRight aria-hidden="true" />
              </a>
            ) : null}
            <span className="live-indicator">
              <i /> {dataMode === "github" ? "GitHub live" : "Demo ready"}
            </span>
          </div>
        </header>

        <main className="workspace" id="overview">
          <section className="source-panel" aria-labelledby="source-title">
            <div className="source-copy">
              <span className="source-icon" data-live={dataMode === "github"}>
                {sourceState === "error" ? (
                  <WifiOff aria-hidden="true" />
                ) : (
                  <FolderGit2 aria-hidden="true" />
                )}
              </span>
              <div>
                <span className="eyebrow">Live evidence source</span>
                <h2 id="source-title">Inspect a public GitHub repository</h2>
                <p>No OAuth, private access, or stored credentials.</p>
              </div>
            </div>
            <form
              className="repository-form"
              onSubmit={(event) => {
                event.preventDefault();
                void loadRepository(repositoryInput);
              }}
            >
              <label htmlFor="repository">Repository</label>
              <div className="repository-controls">
                <Input
                  id="repository"
                  value={repositoryInput}
                  onChange={(event) => setRepositoryInput(event.target.value)}
                  placeholder="owner/repository"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="source-status"
                />
                <Button
                  type="submit"
                  className="load-button"
                  disabled={sourceState === "loading"}
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={sourceState === "loading" ? "is-spinning" : ""}
                  />
                  {sourceState === "loading" ? "Loading…" : "Load live runs"}
                </Button>
                {dataMode === "github" ? (
                  <Button type="button" variant="outline" onClick={showDemo}>
                    Use demo
                  </Button>
                ) : null}
              </div>
              <p
                id="source-status"
                className="source-status"
                data-state={sourceState}
                aria-live="polite"
              >
                {sourceMessage}
              </p>
            </form>
          </section>

          <section className="workspace-heading" aria-labelledby="overview-title">
            <div>
              <span className="eyebrow">
                {dataMode === "github" ? "Observed delivery health" : "Delivery health"}
              </span>
              <h1 id="overview-title">{repository.name}</h1>
              <p>Evidence-first triage across builds, tests, and deployments.</p>
            </div>
            {dataMode === "github" ? (
              <Badge className="live-source-badge">Latest {runs.length} runs</Badge>
            ) : (
              <Select value={windowSize} onValueChange={setWindowSize}>
                <SelectTrigger aria-label="Time window" className="window-select">
                  <Clock3 aria-hidden="true" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            )}
          </section>

          <section className="metric-grid" aria-label="Reliability summary">
            <article className="metric-card">
              <span className="metric-label">Pass rate</span>
              <div className="metric-value">
                {dataMode === "github"
                  ? `${snapshot?.metrics.passRate ?? 0}%`
                  : demoMetrics.passRate}
              </div>
              <div
                className={`metric-foot ${
                  dataMode === "demo"
                    ? demoMetrics.delta.startsWith("↓")
                      ? "is-negative"
                      : "is-positive"
                    : ""
                }`}
              >
                {dataMode === "github"
                  ? `${snapshot?.metrics.completed ?? 0} completed runs observed`
                  : `${demoMetrics.delta} from prior window`}
              </div>
            </article>
            <article className="metric-card">
              <span className="metric-label">
                {dataMode === "github" ? "Median runtime" : "Median recovery"}
              </span>
              <div className="metric-value">
                {dataMode === "github"
                  ? `${Math.max(0, Math.round((snapshot?.metrics.medianDurationSeconds ?? 0) / 60))}m`
                  : demoMetrics.recovery}
              </div>
              <div className="metric-foot is-positive">
                {dataMode === "github"
                  ? `${snapshot?.metrics.medianQueueMinutes ?? 0}m median queue`
                  : "7m faster than target"}
              </div>
            </article>
            <article className="metric-card">
              <span className="metric-label">
                {dataMode === "github" ? "Retried runs" : "Flaky tests"}
              </span>
              <div className="metric-value">
                {dataMode === "github"
                  ? snapshot?.metrics.retried ?? 0
                  : demoMetrics.flaky}
              </div>
              <div className="metric-foot">
                {dataMode === "github"
                  ? "Re-runs are inspected as flaky-test evidence"
                  : "2 suites need ownership"}
              </div>
            </article>
            <article
              className="metric-card metric-card--signal"
              data-posture={failedRunCount ? "degraded" : "stable"}
            >
              <span className="metric-label">Current posture</span>
              <div className="metric-value signal-value">
                {failedRunCount ? (
                  <AlertTriangle aria-hidden="true" />
                ) : (
                  <CheckCircle2 aria-hidden="true" />
                )}
                {failedRunCount ? "Degraded" : "Stable"}
              </div>
              <div className="metric-foot">
                {failedRunCount
                  ? `${failedRunCount} failed run${failedRunCount === 1 ? "" : "s"} in view`
                  : "No failed runs in view"}
              </div>
            </article>
          </section>

          <section className="signal-grid" id="incident">
            <article className="incident-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">
                    {dataMode === "github" ? "Selected GitHub run" : "Active incident"}
                  </span>
                  <h2>Run #{selectedRun.runNumber ?? selectedRun.id}</h2>
                </div>
                <Badge className={`status-badge ${selectedRun.status}`}>
                  {selectedRun.status}
                </Badge>
              </div>

              <div className="incident-title-row">
                <div className="incident-icon" data-status={selectedRun.status}>
                  <SelectedStatusIcon aria-hidden="true" />
                </div>
                <div>
                  <h3>
                    {selectedRun.htmlUrl ? (
                      <a href={selectedRun.htmlUrl} target="_blank" rel="noreferrer">
                        {selectedRun.message}
                      </a>
                    ) : (
                      selectedRun.message
                    )}
                  </h3>
                  <p>
                    <GitBranch aria-hidden="true" /> {selectedRun.branch}
                    <span>·</span>
                    <GitCommit aria-hidden="true" /> {selectedRun.commit}
                    {selectedRun.workflow ? (
                      <>
                        <span>·</span>
                        {selectedRun.workflow}
                      </>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="diagnosis-block">
                <div>
                  <span>Deterministic diagnosis</span>
                  <strong>{analysis.label}</strong>
                </div>
                <div className="confidence-score">
                  <strong>{analysis.confidence}%</strong>
                  <span>confidence</span>
                </div>
              </div>

              <div className="evidence-row" aria-label="Diagnosis evidence">
                {analysis.evidence.slice(0, 3).map((item, index) => (
                  <span key={`${item.label}-${index}`}>
                    <i className={`evidence-dot ${index > 1 ? "muted" : ""}`} />
                    {item.label}
                  </span>
                ))}
              </div>
              {analysisNote ? (
                <p className="analysis-note" data-state={analysisState}>
                  {analysisNote}
                </p>
              ) : null}

              <div className="incident-actions">
                <span
                  className="release-decision"
                  data-decision={analysis.releaseDecision.toLowerCase()}
                >
                  {analysis.releaseDecision} release
                </span>
                <Button
                  className="analyze-button"
                  disabled={analysisState === "loading"}
                  onClick={() => void analyzeById(selectedRun.id)}
                >
                <Activity aria-hidden="true" />
                  {analysisState === "loading"
                    ? "Evaluating evidence…"
                    : analysisState === "ready"
                      ? dataMode === "github"
                        ? "GitHub evidence analyzed"
                        : "Evidence refreshed"
                      : analysisState === "error"
                        ? "Local fallback used"
                        : "Analyze selected run"}
                </Button>
              </div>
            </article>

            <article className="pulse-panel" aria-labelledby="pulse-title">
              <div className="panel-heading compact">
                <div>
                  <span className="eyebrow">Stability pulse</span>
                  <h2 id="pulse-title">Last {activePulse.length} runs</h2>
                </div>
                <span className="pulse-total">
                  {dataMode === "github"
                    ? `${stableRunCount}/${runs.length} passed`
                    : "11/12 stable"}
                </span>
              </div>
              <div className="pulse-chart" aria-label="Reliability score by run">
                {activePulse.map((value, index) => (
                  <div className="pulse-column" key={`${value}-${index}`}>
                    <i
                      className={value < 75 ? "is-low" : ""}
                      style={{ height: `${value}%` }}
                    />
                    <span>
                      {dataMode === "github"
                        ? pulseRuns[index]?.runNumber ?? index + 1
                        : 1842 - (11 - index)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pulse-score">
                <div>
                  <span>{dataMode === "github" ? "Observed pass rate" : "Signal quality"}</span>
                  <strong>
                    {dataMode === "github"
                      ? `${snapshot?.metrics.passRate ?? 0}%`
                      : "88 / 100"}
                  </strong>
                </div>
                <Progress
                  value={dataMode === "github" ? snapshot?.metrics.passRate ?? 0 : 88}
                  aria-label={
                    dataMode === "github"
                      ? `Observed pass rate ${snapshot?.metrics.passRate ?? 0} percent`
                      : "Signal quality 88 percent"
                  }
                />
              </div>
            </article>
          </section>

          <section className="runs-panel" id="runs" aria-labelledby="runs-title">
            <div className="panel-heading runs-heading">
              <div>
                <span className="eyebrow">Evidence stream</span>
                <h2 id="runs-title">Recent workflow runs</h2>
              </div>
              <span className="sync-note">
                {dataMode === "github"
                  ? `Public GitHub API · ${snapshot?.rateLimit.remaining ?? "—"} requests left`
                  : "Representative incident set"}
              </span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Finished</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const StatusIcon = statusIcon[run.status];
                  return (
                    <TableRow
                      key={run.id}
                      data-state={selectedId === run.id ? "selected" : undefined}
                    >
                      <TableCell>
                        <button
                          className="run-link"
                          onClick={() => {
                            setSelectedId(run.id);
                            setAnalysis(analyzeRun(run.signals));
                            setAnalysisState("idle");
                          }}
                        >
                          #{run.runNumber ?? run.id}
                        </button>
                      </TableCell>
                      <TableCell>
                        <strong className="change-title">{run.message}</strong>
                        <span className="change-meta">{run.commit} · {run.actor}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`table-status ${run.status}`}>
                          <StatusIcon aria-hidden="true" /> {run.status}
                        </span>
                      </TableCell>
                      <TableCell>{run.duration}</TableCell>
                      <TableCell className="text-right subtle-cell">
                        {run.finished}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>

          <section className="rules-panel" id="rules" aria-labelledby="rules-title">
            <div className="rules-copy">
              <span className="eyebrow">Decision system</span>
              <h2 id="rules-title">Evidence before explanation.</h2>
              <p>
                Public workflow, job, commit, queue, retry, and branch signals
                enter a deterministic scoring engine. Optional AI can summarize
                the result later; it cannot change a release decision.
              </p>
              <a
                href="https://github.com/calebponce/RunSignal"
                target="_blank"
                rel="noreferrer"
              >
                Review the implementation <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
            <ol className="rule-flow">
              <li>
                <span>01</span>
                <div>
                  <strong>Normalize signals</strong>
                  <p>Outcome, retry, queue, dependency, history, and changed paths.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Score competing causes</strong>
                  <p>Regression, flaky test, runner pressure, or provider incident.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Enforce release policy</strong>
                  <p>Protected branches block on reproducible code regressions.</p>
                </div>
              </li>
            </ol>
            <div className="contract-card" aria-label="Current engine output">
              <span>
                {dataMode === "github" ? "POST /api/github" : "POST /api/analyze"}
              </span>
              <code>
                <i>verdict</i> {analysis.verdict}
                {"\n"}<i>confidence</i> {analysis.confidence}
                {"\n"}<i>release</i> {analysis.releaseDecision}
                {"\n"}<i>engine</i> deterministic/v1
              </code>
            </div>
          </section>

          <footer className="site-footer">
            <span>
              RunSignal · {dataMode === "github" ? "Public GitHub Actions data" : "Representative CI data"} · No access token required
            </span>
            <span>Designed and engineered by Caleb Ponce</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
