import { z } from "zod";

import { analyzeRun } from "@/lib/triage-engine";

export const runtime = "edge";

const requestSchema = z.object({
  runId: z.number().int().positive(),
  outcome: z.enum(["success", "failure", "cancelled"]),
  retryOutcome: z.enum(["success", "failure", "cancelled", "not-run"]),
  historicalFailureRate: z.number().min(0).max(1),
  queueDelayMinutes: z.number().min(0).max(240),
  baselineQueueMinutes: z.number().positive().max(240),
  dependencyHealth: z.enum(["healthy", "degraded", "outage"]),
  touchedApplicationCode: z.boolean(),
  protectedBranch: z.boolean(),
});

export async function GET() {
  return Response.json({
    service: "RunSignal deterministic triage API",
    engineVersion: "1.0.0",
    endpoint: "POST /api/analyze",
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      {
        error: "INVALID_RUN_SIGNAL",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  return Response.json({
    engineVersion: "1.0.0",
    analysis: analyzeRun(parsed.data),
  });
}
