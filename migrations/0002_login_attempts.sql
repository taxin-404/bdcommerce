CREATE TABLE `login_attempts` (
	`id` integer PRIMARY KEY NOT NULL,
	`ip_hash` text NOT NULL,
	`attempted_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_login_attempts_ip_time` ON `login_attempts` (`ip_hash`,`attempted_at`);