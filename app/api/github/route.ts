import { z } from "zod";

import {
  createSnapshot,
  enrichSignals,
  fetchGitHubJson,
  GitHubApiError,
  type GitHubBranch,
  type GitHubCommit,
  type GitHubJob,
  type GitHubRepository,
  type GitHubWorkflowRun,
  normalizeRuns,
  parseRepository,
  summarizeJobs,
} from "@/lib/github-actions";
import { analyzeRun } from "@/lib/triage-engine";

export const runtime = "edge";

const requestSchema = z.object({
  repository: z.string().trim().min(3).max(140),
  runId: z.number().int().positive(),
});

function errorResponse(error: unknown) {
  if (error instanceof GitHubApiError) {
    return Response.json(
      {
        error: error.status === 403 ? "GITHUB_RATE_LIMIT" : "GITHUB_REQUEST_FAILED",
        message: error.message,
        rateLimit: error.rateLimit,
      },
      { status: error.status === 404 ? 404 : 502 },
    );
  }

  return Response.json(
    {
      error: "GITHUB_REQUEST_FAILED",
      message: "RunSignal could not load GitHub Actions data right now.",
    },
    { status: 502 },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsedRepository = parseRepository(url.searchParams.get("repository") || "");

  if (!parsedRepository) {
    return Response.json(
      {
        error: "INVALID_REPOSITORY",
        message: "Enter a public GitHub repository as owner/repository.",
      },
      { status: 400 },
    );
  }

  const basePath = `/repos/${encodeURIComponent(parsedRepository.owner)}/${encodeURIComponent(parsedRepository.repo)}`;

  try {
    const [repositoryResult, runsResult] = await Promise.all([
      fetchGitHubJson<GitHubRepository>(basePath),
      fetchGitHubJson<{ workflow_runs: GitHubWorkflowRun[] }>(
        `${basePath}/actions/runs?per_page=20&exclude_pull_requests=false`,
      ),
    ]);

    if (repositoryResult.data.private) {
      return Response.json(
        {
          error: "PRIVATE_REPOSITORY",
          message: "RunSignal only reads public repositories and never asks for a token.",
        },
        { status: 400 },
      );
    }

    const snapshot = createSnapshot(
      repositoryResult.data,
      runsResult.data.workflow_runs,
      runsResult.rateLimit,
    );

    return Response.json({
      source: "github-public",
      ...snapshot,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      {
        error: "INVALID_ANALYSIS_REQUEST",
        message: "Choose a loaded workflow run from a valid public repository.",
      },
      { status: 400 },
    );
  }

  const parsedRepository = parseRepository(parsed.data.repository);
  if (!parsedRepository) {
    return Response.json(
      {
        error: "INVALID_REPOSITORY",
        message: "Enter a public GitHub repository as owner/repository.",
      },
      { status: 400 },
    );
  }

  const basePath = `/repos/${encodeURIComponent(parsedRepository.owner)}/${encodeURIComponent(parsedRepository.repo)}`;
  const runPath = `${basePath}/actions/runs/${parsed.data.runId}`;

  try {
    const runResult = await fetchGitHubJson<GitHubWorkflowRun>(runPath);
    const branchName = runResult.data.head_branch;
    const branchPath = branchName
      ? `${basePath}/branches/${encodeURIComponent(branchName)}`
      : null;
    const historyPath = `${basePath}/actions/workflows/${runResult.data.workflow_id}/runs?per_page=30&status=completed`;

    const [historyResult, jobsResult, commitResult, branchResult] =
      await Promise.all([
        fetchGitHubJson<{ workflow_runs: GitHubWorkflowRun[] }>(historyPath),
        fetchGitHubJson<{ jobs: GitHubJob[] }>(`${runPath}/jobs?per_page=100`),
        fetchGitHubJson<GitHubCommit>(
          `${basePath}/commits/${encodeURIComponent(runResult.data.head_sha)}`,
        ),
        branchPath
          ? fetchGitHubJson<GitHubBranch>(branchPath).catch(() => ({
              data: null,
              rateLimit: runResult.rateLimit,
            }))
          : Promise.resolve({ data: null, rateLimit: runResult.rateLimit }),
      ]);

    const history = historyResult.data.workflow_runs.some(
      (candidate) => candidate.id === runResult.data.id,
    )
      ? historyResult.data.workflow_runs
      : [runResult.data, ...historyResult.data.workflow_runs];
    const normalized = normalizeRuns(history).find(
      (candidate) => candidate.id === runResult.data.id,
    );

    if (!normalized) {
      throw new Error("The selected workflow run could not be normalized.");
    }

    const enriched = enrichSignals(
      normalized.signals,
      commitResult.data,
      branchResult.data,
    );

    return Response.json({
      source: "github-public",
      adapterVersion: "1.1.0",
      engineVersion: "1.0.0",
      analysis: analyzeRun(enriched.signals),
      signals: enriched.signals,
      diagnostics: {
        changedFiles: enriched.changedFiles.slice(0, 12),
        changedFileCount: enriched.changedFiles.length,
        failedJobs: summarizeJobs(jobsResult.data.jobs),
        branchProtectionVerified: branchResult.data !== null,
        dependencyHealthSource: "not available from GitHub Actions",
      },
      rateLimit: historyResult.rateLimit,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
