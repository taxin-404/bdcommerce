CREATE TABLE `phone_flags` (
	`phone` text PRIMARY KEY NOT NULL,
	`reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `courier_status` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `courier_status_updated_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `courier_claim` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `courier_claimed_at` text;--> statement-breakpoint
CREATE INDEX `idx_orders_ip_created` ON `orders` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_payment_trx` ON `orders` (`payment_method`,`payment_trx_id`);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `orders_duplicate_trx_insert`
BEFORE INSERT ON `orders`
WHEN NEW.`payment_trx_id` IS NOT NULL
  AND NEW.`payment_method` IN ('bkash', 'nagad')
  AND EXISTS (
    SELECT 1 FROM `orders`
     WHERE `payment_method` = NEW.`payment_method`
       AND `payment_trx_id` = NEW.`payment_trx_id`
  )
BEGIN
  SELECT RAISE(ABORT, 'duplicate_payment_trx');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `orders_duplicate_trx_update`
BEFORE UPDATE OF `payment_method`, `payment_trx_id` ON `orders`
WHEN NEW.`payment_trx_id` IS NOT NULL
  AND NEW.`payment_method` IN ('bkash', 'nagad')
  AND EXISTS (
    SELECT 1 FROM `orders`
     WHERE `payment_method` = NEW.`payment_method`
       AND `payment_trx_id` = NEW.`payment_trx_id`
       AND `id` <> NEW.`id`
  )
BEGIN
  SELECT RAISE(ABORT, 'duplicate_payment_trx');
END;--> statement-breakpoint
-- Per-install salt for hashing IP addresses. It is generated once per
-- database and never leaves D1. Existing installs keep their value.
INSERT OR IGNORE INTO `settings` (`key`, `value`)
VALUES ('ip_hash_salt', '"' || hex(randomblob(32)) || '"');