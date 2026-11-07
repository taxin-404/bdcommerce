CREATE TABLE `store_payment_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`provider` text NOT NULL,
	`ciphertext` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creds_store_provider` ON `store_payment_credentials` (`store_id`,`provider`);--> statement-breakpoint
ALTER TABLE `payments` ADD `transaction_id` text;--> statement-breakpoint
CREATE INDEX `payments_ref` ON `payments` (`store_id`,`provider`,`provider_ref`);