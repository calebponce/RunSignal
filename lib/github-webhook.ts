import type { DeliveryStore } from "./webhook-delivery-store";

const MAX_PAYLOAD_BYTES = 1024 * 1024;
const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i;
const DELIVERY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function verifyGitHubSignature(
  secret: string,
  signatureHeader: string | null,
  body: Uint8Array,
): Promise<boolean> {
  const match = signatureHeader?.match(SIGNATURE_PATTERN);
  if (!secret || !match) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new Uint8Array(body)));
  const supplied = hexToBytes(match[1]);

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index] ^ supplied[index];
  }
  return difference === 0;
}

function completedRun(payload: unknown): { repository: string; runId: number } | null {
  if (!isRecord(payload) || payload.action !== "completed") return null;
  const repository = payload.repository;
  const run = payload.workflow_run;
  if (!isRecord(repository) || !isRecord(run)) return null;
  if (typeof repository.full_name !== "string" || !REPOSITORY_PATTERN.test(repository.full_name)) {
    return null;
  }
  if (!Number.isSafeInteger(run.id) || (run.id as number) <= 0 || run.status !== "completed") {
    return null;
  }
  return { repository: repository.full_name, runId: run.id as number };
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PAYLOAD_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function handleGitHubWebhook(
  request: Request,
  secret: string | undefined,
  deliveryStore?: DeliveryStore,
): Promise<Response> {
  if (!secret) {
    return Response.json({ error: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PAYLOAD_BYTES) {
    return Response.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  const body = await readBoundedBody(request);
  if (!body) {
    return Response.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }
  if (!(await verifyGitHubSignature(secret, request.headers.get("x-hub-signature-256"), body))) {
    return Response.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  const deliveryId = request.headers.get("x-github-delivery");
  if (!deliveryId || !DELIVERY_PATTERN.test(deliveryId)) {
    return Response.json({ error: "INVALID_DELIVERY_ID" }, { status: 400 });
  }
  if (request.headers.get("x-github-event") !== "workflow_run") {
    return Response.json({ status: "ignored", mode: "shadow", deliveryId }, { status: 202 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (isRecord(payload) && payload.action !== "completed") {
    return Response.json({ status: "ignored", mode: "shadow", deliveryId }, { status: 202 });
  }
  const run = completedRun(payload);
  if (!run) {
    return Response.json({ error: "INVALID_WORKFLOW_RUN" }, { status: 400 });
  }

  if (deliveryStore) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(body)));
    const payloadSha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    try {
      const outcome = await deliveryStore.record({ deliveryId, payloadSha256, ...run });
      if (outcome === "conflict") {
        return Response.json({ error: "DELIVERY_ID_CONFLICT", deliveryId }, { status: 409 });
      }
      return Response.json(
        { status: outcome === "new" ? "recorded" : "duplicate", mode: "ledger", deliveryId, ...run },
        { status: outcome === "new" ? 202 : 200 },
      );
    } catch {
      // A configured but unavailable ledger must never silently revert to shadow mode.
      return Response.json({ error: "DELIVERY_STORE_UNAVAILABLE" }, { status: 503 });
    }
  }

  return Response.json(
    { status: "validated", mode: "shadow", deliveryId, ...run },
    { status: 202 },
  );
}
