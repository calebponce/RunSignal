CREATE TABLE `webhook_deliveries` (
	`delivery_id` text PRIMARY KEY NOT NULL,
	`payload_sha256` text NOT NULL,
	`repository` text NOT NULL,
	`run_id` integer NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
