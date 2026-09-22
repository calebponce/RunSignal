export type Delivery = {
  deliveryId: string;
  payloadSha256: string;
  repository: string;
  runId: number;
};

export type DeliveryResult = "new" | "duplicate" | "conflict";

export interface DeliveryStore {
  record(delivery: Delivery): Promise<DeliveryResult>;
}

export class D1DeliveryStore implements DeliveryStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async record(delivery: Delivery): Promise<DeliveryResult> {
    // The primary key makes this insert atomic across concurrent redeliveries.
    const inserted = await this.database
      .prepare(
        "INSERT OR IGNORE INTO webhook_deliveries (delivery_id, payload_sha256, repository, run_id) VALUES (?, ?, ?, ?)",
      )
      .bind(delivery.deliveryId, delivery.payloadSha256, delivery.repository, delivery.runId)
      .run();

    if (inserted.meta.changes === 1) return "new";

    const existing = await this.database
      .prepare(
        "SELECT payload_sha256, repository, run_id FROM webhook_deliveries WHERE delivery_id = ?",
      )
      .bind(delivery.deliveryId)
      .first<{ payload_sha256: string; repository: string; run_id: number }>();

    if (
      existing?.payload_sha256 === delivery.payloadSha256 &&
      existing.repository === delivery.repository &&
      existing.run_id === delivery.runId
    ) {
      return "duplicate";
    }
    return "conflict";
  }
}
