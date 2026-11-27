CREATE TABLE `checkout_guard` (
	`id` integer PRIMARY KEY NOT NULL,
	`ok` integer NOT NULL,
	CONSTRAINT "checkout_guard_ok_check" CHECK("checkout_guard"."ok" = 1)
);
--> statement-breakpoint
INSERT OR IGNORE INTO `checkout_guard` (`id`, `ok`) VALUES (1, 1);
