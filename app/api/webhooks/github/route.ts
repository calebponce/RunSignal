import { handleGitHubWebhook } from "@/lib/github-webhook";

export const runtime = "edge";

export async function POST(request: Request) {
  return handleGitHubWebhook(request, process.env.RUNSIGNAL_GITHUB_WEBHOOK_SECRET);
}
