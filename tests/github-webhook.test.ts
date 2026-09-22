import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleGitHubWebhook, verifyGitHubSignature } from "../lib/github-webhook.ts";

const secret = "It's a Secret to Everybody";
const deliveryId = "0b989ba4-242f-11e5-81e1-c7b6966d2516";
const payload = JSON.stringify({
  action: "completed",
  repository: { full_name: "calebponce/RunSignal" },
  workflow_run: { id: 101, status: "completed", conclusion: "failure" },
});

function signedRequest(body: string, overrides: Record<string, string> = {}) {
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return new Request("https://example.test/api/webhooks/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${signature}`,
      "x-github-delivery": deliveryId,
      "x-github-event": "workflow_run",
      ...overrides,
    },
    body,
  });
}

test("matches GitHub's published HMAC-SHA256 test vector", async () => {
  assert.equal(
    await verifyGitHubSignature(
      secret,
      "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
      new TextEncoder().encode("Hello, World!"),
    ),
    true,
  );
});

test("accepts a signed completed run only in shadow mode", async () => {
  const response = await handleGitHubWebhook(signedRequest(payload), secret);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    status: "validated",
    mode: "shadow",
    deliveryId,
    repository: "calebponce/RunSignal",
    runId: 101,
  });
});

test("rejects tampered bytes and missing signatures", async () => {
  const tampered = signedRequest(payload, { "x-hub-signature-256": `sha256=${"0".repeat(64)}` });
  assert.equal((await handleGitHubWebhook(tampered, secret)).status, 401);
  const missing = signedRequest(payload, { "x-hub-signature-256": "" });
  assert.equal((await handleGitHubWebhook(missing, secret)).status, 401);
});

test("does not accept requests when the secret is absent", async () => {
  assert.equal((await handleGitHubWebhook(signedRequest(payload), undefined)).status, 503);
});

test("validates the delivery ID and completed-run shape after signature verification", async () => {
  assert.equal(
    (await handleGitHubWebhook(signedRequest(payload, { "x-github-delivery": "invalid" }), secret)).status,
    400,
  );
  const malformed = JSON.stringify({ action: "completed", repository: {}, workflow_run: { id: 101 } });
  assert.equal((await handleGitHubWebhook(signedRequest(malformed), secret)).status, 400);
});

test("ignores other event types and rejects oversized requests", async () => {
  const other = signedRequest(payload, { "x-github-event": "ping" });
  const ignored = (await (await handleGitHubWebhook(other, secret)).json()) as { status: string };
  assert.equal(ignored.status, "ignored");
  const oversized = signedRequest(payload, { "content-length": String(1024 * 1024 + 1) });
  assert.equal((await handleGitHubWebhook(oversized, secret)).status, 413);
  const actualOversize = signedRequest("x".repeat(1024 * 1024 + 1));
  assert.equal((await handleGitHubWebhook(actualOversize, secret)).status, 413);
});
