export type RunOutcome = "success" | "failure" | "cancelled";
export type DependencyHealth = "healthy" | "degraded" | "outage";
export type TriageVerdict =
  | "healthy"
  | "code-regression"
  | "flaky-test"
  | "infrastructure"
  | "external-dependency"
  | "inconclusive";

export type TriageInput = {
  runId: number;
  outcome: RunOutcome;
  retryOutcome: RunOutcome | "not-run";
  historicalFailureRate: number;
  queueDelayMinutes: number;
  baselineQueueMinutes: number;
  dependencyHealth: DependencyHealth;
  touchedApplicationCode: boolean;
  protectedBranch: boolean;
};

export type Evidence = {
  label: string;
  detail: string;
  supports: TriageVerdict;
  weight: number;
};

export type TriageResult = {
  runId: number;
  verdict: TriageVerdict;
  label: string;
  severity: "none" | "low" | "medium" | "high" | "critical";
  confidence: number;
  releaseDecision: "ALLOW" | "HOLD" | "BLOCK";
  recommendedAction: string;
  explanation: string;
  evidence: Evidence[];
  scorecard: Record<Exclude<TriageVerdict, "healthy" | "inconclusive">, number>;
};

const labels: Record<TriageVerdict, string> = {
  healthy: "No incident detected",
  "code-regression": "Probable code regression",
  "flaky-test": "Known flaky test pattern",
  infrastructure: "Runner infrastructure pressure",
  "external-dependency": "External dependency incident",
  inconclusive: "Insufficient evidence",
};

const actions: Record<TriageVerdict, string> = {
  healthy: "Continue the release and keep standard monitoring active.",
  "code-regression": "Block the release, inspect the changed paths, and prepare a revert.",
  "flaky-test": "Hold the release, quarantine the unstable test, and rerun the suite.",
  infrastructure: "Hold the release and restore runner capacity before retrying.",
  "external-dependency": "Hold the release and monitor the affected provider before retrying.",
  inconclusive: "Hold the release and collect another clean retry before deciding.",
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function analyzeRun(input: TriageInput): TriageResult {
  const scorecard = {
    "code-regression": 0,
    "flaky-test": 0,
    infrastructure: 0,
    "external-dependency": 0,
  };
  const evidence: Evidence[] = [];

  if (input.outcome === "success") {
    return {
      runId: input.runId,
      verdict: "healthy",
      label: labels.healthy,
      severity: "none",
      confidence: 99,
      releaseDecision: "ALLOW",
      recommendedAction: actions.healthy,
      explanation:
        "The workflow completed successfully and no blocking reliability signal is present.",
      evidence: [
        {
          label: "Workflow completed",
          detail: "All required checks passed.",
          supports: "healthy",
          weight: 100,
        },
      ],
      scorecard,
    };
  }

  if (input.outcome === "cancelled") {
    return {
      runId: input.runId,
      verdict: "inconclusive",
      label: labels.inconclusive,
      severity: "medium",
      confidence: 62,
      releaseDecision: "HOLD",
      recommendedAction: actions.inconclusive,
      explanation:
        "The run ended before its required checks produced enough evidence for a release decision.",
      evidence: [
        {
          label: "Run cancelled",
          detail: "Required checks did not reach a terminal result.",
          supports: "inconclusive",
          weight: 62,
        },
      ],
      scorecard,
    };
  }

  if (input.retryOutcome === "failure") {
    scorecard["code-regression"] += 36;
    evidence.push({
      label: "Failure reproduced",
      detail: "The same failure remained after a clean retry.",
      supports: "code-regression",
      weight: 36,
    });
  }

  if (input.retryOutcome === "success") {
    scorecard["flaky-test"] += 48;
    evidence.push({
      label: "Retry recovered",
      detail: "The failed check passed without a code change.",
      supports: "flaky-test",
      weight: 48,
    });
  }

  if (input.historicalFailureRate >= 0.2) {
    const weight = Math.round(clamp(input.historicalFailureRate * 80, 16, 38));
    scorecard["flaky-test"] += weight;
    evidence.push({
      label: "Recurring test signature",
      detail: `${Math.round(input.historicalFailureRate * 100)}% historical failure rate.`,
      supports: "flaky-test",
      weight,
    });
  }

  const queueRatio =
    input.baselineQueueMinutes > 0
      ? input.queueDelayMinutes / input.baselineQueueMinutes
      : 1;

  if (queueRatio >= 1.8) {
    const weight = Math.round(clamp(queueRatio * 22, 38, 58));
    scorecard.infrastructure += weight;
    evidence.push({
      label: "Runner queue saturation",
      detail: `${input.queueDelayMinutes}m queue versus ${input.baselineQueueMinutes}m baseline.`,
      supports: "infrastructure",
      weight,
    });
  }

  if (input.dependencyHealth !== "healthy") {
    const weight = input.dependencyHealth === "outage" ? 62 : 34;
    scorecard["external-dependency"] += weight;
    evidence.push({
      label: "Provider health signal",
      detail: `A required dependency reports ${input.dependencyHealth} health.`,
      supports: "external-dependency",
      weight,
    });
  }

  if (input.touchedApplicationCode) {
    scorecard["code-regression"] += 32;
    evidence.push({
      label: "Application code changed",
      detail: "The commit modified paths exercised by the failed suite.",
      supports: "code-regression",
      weight: 32,
    });
  }

  const ranked = Object.entries(scorecard).sort((a, b) => b[1] - a[1]) as Array<
    [Exclude<TriageVerdict, "healthy" | "inconclusive">, number]
  >;
  const [verdict, topScore] = ranked[0];
  const secondScore = ranked[1][1];

  if (topScore === 0) {
    return {
      runId: input.runId,
      verdict: "inconclusive",
      label: labels.inconclusive,
      severity: "medium",
      confidence: 61,
      releaseDecision: "HOLD",
      recommendedAction: actions.inconclusive,
      explanation:
        "The failure has no corroborating retry, history, infrastructure, dependency, or code-change signal.",
      evidence: [],
      scorecard,
    };
  }

  const confidence = clamp(Math.round(60 + topScore * 0.45 - secondScore * 0.18), 61, 98);
  const severity = input.protectedBranch
    ? verdict === "code-regression"
      ? "critical"
      : "high"
    : verdict === "flaky-test"
      ? "medium"
      : "high";
  const releaseDecision =
    verdict === "code-regression" && input.protectedBranch ? "BLOCK" : "HOLD";
  const decisionPhrase = releaseDecision === "BLOCK" ? "blocked" : "on hold";

  return {
    runId: input.runId,
    verdict,
    label: labels[verdict],
    severity,
    confidence,
    releaseDecision,
    recommendedAction: actions[verdict],
    explanation: `${evidence[0]?.detail ?? "The workflow failed."} The rule engine keeps the release ${decisionPhrase} until the signal is resolved.`,
    evidence: evidence.sort((a, b) => b.weight - a.weight),
    scorecard,
  };
}
