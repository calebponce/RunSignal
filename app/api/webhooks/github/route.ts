import { env } from "cloudflare:workers";
import { handleGitHubWebhook } from "@/lib/github-webhook";
import { D1DeliveryStore } from "@/lib/webhook-delivery-store";

export const runtime = "edge";

export async function POST(request: Request) {
  return handleGitHubWebhook(
    request,
    process.env.RUNSIGNAL_GITHUB_WEBHOOK_SECRET,
    env.DB ? new D1DeliveryStore(env.DB) : undefined,
  );
}
