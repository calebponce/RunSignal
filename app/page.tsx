"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  GitBranch,
  GitCommit,
  LayoutDashboard,
  ListChecks,
  RadioTower,
  Search,
  Settings2,
  ShieldCheck,
  TimerReset,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type RunStatus = "passed" | "failed" | "cancelled";

type Run = {
  id: number;
  branch: string;
  commit: string;
  message: string;
  actor: string;
  status: RunStatus;
  duration: string;
  finished: string;
  signals: TriageInput;
};

const runs: Run[] = [
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

const pulse = [82, 88, 91, 78, 94, 90, 87, 96, 92, 74, 89, 67];

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
  const [selectedId, setSelectedId] = useState(1842);
  const [analysis, setAnalysis] = useState<TriageResult>(() =>
    analyzeRun(runs[0].signals),
  );
  const [analysisState, setAnalysisState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedId) ?? runs[0],
    [selectedId],
  );
  const SelectedStatusIcon = statusIcon[selectedRun.status];
  const metrics = windowMetrics[windowSize as keyof typeof windowMetrics];

  const analyzeById = useCallback(async (runId: number) => {
    const run = runs.find((candidate) => candidate.id === runId);
    if (!run) throw new Error(`Run ${runId} is not available in the demo.`);

    setSelectedId(run.id);
    setAnalysisState("loading");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(run.signals),
      });

      if (!response.ok) throw new Error("The triage service rejected this run.");

      const payload = (await response.json()) as { analysis: TriageResult };
      setAnalysis(payload.analysis);
      setAnalysisState("ready");
      return payload.analysis;
    } catch {
      const fallback = analyzeRun(run.signals);
      setAnalysis(fallback);
      setAnalysisState("error");
      return fallback;
    }
  }, []);

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
            "Select and analyze one representative workflow run using RunSignal's deterministic evidence rules.",
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
            untrustedContentHint: false,
          },
          async execute(input) {
            const runId = (input as { runId?: unknown })?.runId;
            if (
              typeof runId !== "number" ||
              !runs.some((run) => run.id === runId)
            ) {
              throw new Error("Choose a run ID exposed by the RunSignal demo.");
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
  }, [analyzeById]);

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
            <span className="nav-count">12</span>
          </a>
          <a className="nav-item" href="#incident">
            <RadioTower aria-hidden="true" />
            Incidents
            <span className="nav-count is-alert">1</span>
          </a>
          <a className="nav-item" href="#rules">
            <ShieldCheck aria-hidden="true" />
            Rules
          </a>
        </nav>

        <div className="rail-foot">
          <span className="demo-label">Representative data</span>
          <p>Interactive portfolio build. No repository access required.</p>
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
              <strong>northstar/checkout-api</strong>
              <span>demo</span>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="search-cue" aria-hidden="true">
              <Search />
              <span>Search runs</span>
              <kbd>⌘K</kbd>
            </div>
            <Button variant="outline" size="icon" aria-label="Dashboard settings">
              <Settings2 />
            </Button>
            <span className="live-indicator">
              <i /> Live
            </span>
          </div>
        </header>

        <main className="workspace" id="overview">
          <section className="workspace-heading" aria-labelledby="overview-title">
            <div>
              <span className="eyebrow">Delivery health</span>
              <h1 id="overview-title">Checkout API</h1>
              <p>Evidence-first triage across builds, tests, and deployments.</p>
            </div>
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
          </section>

          <section className="metric-grid" aria-label="Reliability summary">
            <article className="metric-card">
              <span className="metric-label">Pass rate</span>
              <div className="metric-value">{metrics.passRate}</div>
              <div
                className={`metric-foot ${metrics.delta.startsWith("↓") ? "is-negative" : "is-positive"}`}
              >
                {metrics.delta} from prior window
              </div>
            </article>
            <article className="metric-card">
              <span className="metric-label">Median recovery</span>
              <div className="metric-value">{metrics.recovery}</div>
              <div className="metric-foot is-positive">7m faster than target</div>
            </article>
            <article className="metric-card">
              <span className="metric-label">Flaky tests</span>
              <div className="metric-value">{metrics.flaky}</div>
              <div className="metric-foot">2 suites need ownership</div>
            </article>
            <article className="metric-card metric-card--signal">
              <span className="metric-label">Current posture</span>
              <div className="metric-value signal-value">
                <AlertTriangle aria-hidden="true" /> Degraded
              </div>
              <div className="metric-foot">1 release-blocking failure</div>
            </article>
          </section>

          <section className="signal-grid" id="incident">
            <article className="incident-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Active incident</span>
                  <h2>Run #{selectedRun.id}</h2>
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
                  <h3>{selectedRun.message}</h3>
                  <p>
                    <GitBranch aria-hidden="true" /> {selectedRun.branch}
                    <span>·</span>
                    <GitCommit aria-hidden="true" /> {selectedRun.commit}
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
                      ? "Evidence refreshed"
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
                  <h2 id="pulse-title">Last 12 runs</h2>
                </div>
                <span className="pulse-total">11/12 stable</span>
              </div>
              <div className="pulse-chart" aria-label="Reliability score by run">
                {pulse.map((value, index) => (
                  <div className="pulse-column" key={`${value}-${index}`}>
                    <i
                      className={value < 75 ? "is-low" : ""}
                      style={{ height: `${value}%` }}
                    />
                    <span>{1842 - (11 - index)}</span>
                  </div>
                ))}
              </div>
              <div className="pulse-score">
                <div>
                  <span>Signal quality</span>
                  <strong>88 / 100</strong>
                </div>
                <Progress value={88} aria-label="Signal quality 88 percent" />
              </div>
            </article>
          </section>

          <section className="runs-panel" id="runs" aria-labelledby="runs-title">
            <div className="panel-heading runs-heading">
              <div>
                <span className="eyebrow">Evidence stream</span>
                <h2 id="runs-title">Recent workflow runs</h2>
              </div>
              <span className="sync-note">Updated 12 seconds ago</span>
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
                          #{run.id}
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
                Webhook-shaped run signals enter a deterministic scoring engine.
                Optional AI can summarize the result later; it cannot change a
                release decision.
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
              <span>POST /api/analyze</span>
              <code>
                <i>verdict</i> {analysis.verdict}
                {"\n"}<i>confidence</i> {analysis.confidence}
                {"\n"}<i>release</i> {analysis.releaseDecision}
                {"\n"}<i>engine</i> deterministic/v1
              </code>
            </div>
          </section>

          <footer className="site-footer">
            <span>RunSignal · Representative CI data · No access token required</span>
            <span>Designed and engineered by Caleb Ponce</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
