DROP INDEX `payments_ref`;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_ref` ON `payments` (`store_id`,`provider`,`provider_ref`);