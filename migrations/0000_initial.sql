CREATE TABLE `categories` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_bn` text,
	`parent_id` integer,
	`image_key` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_cat_parent` ON `categories` (`parent_id`,`sort`);--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` integer PRIMARY KEY NOT NULL,
	`product_id` integer NOT NULL,
	`r2_key` text NOT NULL,
	`alt` text,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_images_product` ON `product_images` (`product_id`,`sort`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`title_bn` text,
	`description` text,
	`description_bn` text,
	`category_id` integer,
	`price` integer NOT NULL,
	`compare_at_price` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`track_stock` integer DEFAULT true NOT NULL,
	`attributes` text,
	`featured` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_status_check" CHECK("products"."status" in ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_products_status_cat` ON `products` (`status`,`category_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_products_featured` ON `products` (`status`,`featured`,`id`);--> statement-breakpoint
CREATE TABLE `variants` (
	`id` integer PRIMARY KEY NOT NULL,
	`product_id` integer NOT NULL,
	`sku` text,
	`title` text NOT NULL,
	`options` text,
	`price` integer,
	`stock` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `variants_sku_unique` ON `variants` (`sku`);--> statement-breakpoint
CREATE INDEX `idx_variants_product` ON `variants` (`product_id`);--> statement-breakpoint
CREATE TABLE `blocklist` (
	`phone` text PRIMARY KEY NOT NULL,
	`reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`code` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`value` integer NOT NULL,
	`min_subtotal` integer DEFAULT 0 NOT NULL,
	`max_uses` integer,
	`used` integer DEFAULT 0 NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`active` integer DEFAULT true NOT NULL,
	CONSTRAINT "coupons_type_check" CHECK("coupons"."type" in ('percent', 'fixed'))
);
--> statement-breakpoint
CREATE TABLE `order_events` (
	`id` integer PRIMARY KEY NOT NULL,
	`order_id` integer NOT NULL,
	`type` text NOT NULL,
	`message` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_events_order` ON `order_events` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY NOT NULL,
	`order_id` integer NOT NULL,
	`product_id` integer,
	`variant_id` integer,
	`title_snapshot` text NOT NULL,
	`variant_snapshot` text,
	`unit_price` integer NOT NULL,
	`qty` integer NOT NULL,
	`line_total` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_items_order` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`customer_name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`division` text,
	`district` text,
	`upazila` text,
	`address` text NOT NULL,
	`note` text,
	`subtotal` integer NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`shipping_fee` integer NOT NULL,
	`total` integer NOT NULL,
	`coupon_code` text,
	`payment_method` text NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`payment_trx_id` text,
	`payment_sender` text,
	`courier` text,
	`consignment_id` text,
	`tracking_code` text,
	`ip_hash` text,
	`idempotency_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "orders_status_check" CHECK("orders"."status" in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned')),
	CONSTRAINT "orders_payment_method_check" CHECK("orders"."payment_method" in ('cod', 'bkash', 'nagad')),
	CONSTRAINT "orders_payment_status_check" CHECK("orders"."payment_status" in ('unpaid', 'pending_verification', 'paid', 'refunded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_key_unique` ON `orders` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_orders_phone` ON `orders` (`phone`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_status` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
