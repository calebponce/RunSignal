import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// No raw webhook body is retained. The delivery ID is the idempotency key.
export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  deliveryId: text("delivery_id").primaryKey(),
  payloadSha256: text("payload_sha256").notNull(),
  repository: text("repository").notNull(),
  runId: integer("run_id").notNull(),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
