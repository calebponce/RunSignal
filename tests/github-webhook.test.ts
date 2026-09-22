import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { handleGitHubWebhook, verifyGitHubSignature } from "../lib/github-webhook.ts";
import { D1DeliveryStore, type Delivery } from "../lib/webhook-delivery-store.ts";

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

function memoryD1() {
  const rows = new Map<string, Delivery>();
  const database = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              assert.match(query, /^INSERT OR IGNORE/);
              const [deliveryId, payloadSha256, repository, runId] = values as [string, string, string, number];
              if (rows.has(deliveryId)) return { meta: { changes: 0 } };
              rows.set(deliveryId, { deliveryId, payloadSha256, repository, runId });
              return { meta: { changes: 1 } };
            },
            async first() {
              assert.match(query, /^SELECT/);
              const row = rows.get(values[0] as string);
              return row
                ? { payload_sha256: row.payloadSha256, repository: row.repository, run_id: row.runId }
                : null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { rows, store: new D1DeliveryStore(database) };
}

test("the optional ledger records a delivery once and detects conflicting redelivery bytes", async () => {
  const { rows, store } = memoryD1();
  const first = await handleGitHubWebhook(signedRequest(payload), secret, store);
  assert.equal(first.status, 202);
  assert.deepEqual(await first.json(), {
    status: "recorded",
    mode: "ledger",
    deliveryId,
    repository: "calebponce/RunSignal",
    runId: 101,
  });
  const duplicate = await handleGitHubWebhook(signedRequest(payload), secret, store);
  assert.equal(duplicate.status, 200);
  assert.equal(((await duplicate.json()) as { status: string }).status, "duplicate");
  const changed = payload.replace('"conclusion":"failure"', '"conclusion":"success"');
  const conflict = await handleGitHubWebhook(signedRequest(changed), secret, store);
  assert.equal(conflict.status, 409);
  assert.equal(((await conflict.json()) as { error: string }).error, "DELIVERY_ID_CONFLICT");
  assert.equal(rows.size, 1);
});

test("invalid signatures never write, and a configured ledger failure fails closed", async () => {
  const { rows, store } = memoryD1();
  const badSignature = signedRequest(payload, { "x-hub-signature-256": `sha256=${"0".repeat(64)}` });
  assert.equal((await handleGitHubWebhook(badSignature, secret, store)).status, 401);
  assert.equal(rows.size, 0);

  const brokenStore = { record: async () => { throw new Error("database unavailable"); } };
  const response = await handleGitHubWebhook(signedRequest(payload), secret, brokenStore);
  assert.equal(response.status, 503);
  assert.equal(((await response.json()) as { error: string }).error, "DELIVERY_STORE_UNAVAILABLE");
});

test("the generated SQLite migration supports the D1 adapter and timestamps rows", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const migration = readFileSync(new URL("../drizzle/0000_steep_tomas.sql", import.meta.url), "utf8");
    database.exec(migration);
    const sqliteBackedD1 = {
      prepare(query: string) {
        return {
          bind(...values: (string | number)[]) {
            return {
              async run() {
                const result = database.prepare(query).run(...values);
                return { meta: { changes: Number(result.changes) } };
              },
              async first() {
                return database.prepare(query).get(...values) ?? null;
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    const store = new D1DeliveryStore(sqliteBackedD1);
    const record: Delivery = {
      deliveryId,
      payloadSha256: "digest",
      repository: "calebponce/RunSignal",
      runId: 101,
    };
    assert.equal(await store.record(record), "new");
    assert.equal(await store.record(record), "duplicate");
    assert.equal(await store.record({ ...record, payloadSha256: "other-digest" }), "conflict");
    const row = database.prepare("SELECT received_at FROM webhook_deliveries WHERE delivery_id = ?").get(deliveryId);
    assert.equal(typeof row?.received_at, "string");
    assert.notEqual(row?.received_at, "CURRENT_TIMESTAMP");
  } finally {
    database.close();
  }
});
