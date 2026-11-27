CREATE TABLE IF NOT EXISTS `coupon_guard` (
	`id` integer PRIMARY KEY NOT NULL,
	`ok` integer NOT NULL,
	CONSTRAINT "coupon_guard_ok_check" CHECK("coupon_guard"."ok" = 1)
);
