CREATE INDEX `idx_variants_stock` ON `variants` (`stock`,`id`);--> statement-breakpoint
CREATE INDEX `idx_orders_created_id` ON `orders` ("created_at" desc,"id" desc);--> statement-breakpoint
CREATE INDEX `idx_orders_status_created_id` ON `orders` (`status`,"created_at" desc,"id" desc);--> statement-breakpoint
CREATE INDEX `idx_orders_phone_created_id` ON `orders` (`phone`,"created_at" desc,"id" desc);--> statement-breakpoint
CREATE INDEX `idx_orders_phone_status_created_id` ON `orders` (`phone`,`status`,"created_at" desc,"id" desc);--> statement-breakpoint
CREATE TABLE `order_transition_guard` (
	`id` integer PRIMARY KEY NOT NULL,
	`ok` integer NOT NULL,
	CONSTRAINT "order_transition_guard_ok_check" CHECK("order_transition_guard"."ok" = 1)
);
--> statement-breakpoint
INSERT OR IGNORE INTO `order_transition_guard` (`id`, `ok`) VALUES (1, 1);