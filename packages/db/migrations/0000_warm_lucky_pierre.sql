CREATE TABLE `blocked_phones` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`phone` text NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocked_store_phone` ON `blocked_phones` (`store_id`,`phone`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_store_slug` ON `categories` (`store_id`,`slug`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_store_phone` ON `customers` (`store_id`,`phone`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`name` text NOT NULL,
	`sku` text NOT NULL,
	`unit_price` integer NOT NULL,
	`quantity` integer NOT NULL,
	`total` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_items_order` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`number` integer NOT NULL,
	`customer_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_method` text DEFAULT 'cod' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`subtotal` integer NOT NULL,
	`shipping_fee` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`ship_name` text NOT NULL,
	`ship_phone` text NOT NULL,
	`division` text NOT NULL,
	`district` text NOT NULL,
	`upazila` text,
	`area` text,
	`address_line` text NOT NULL,
	`note` text,
	`courier` text,
	`tracking_code` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_store_number` ON `orders` (`store_id`,`number`);--> statement-breakpoint
CREATE INDEX `orders_store_status` ON `orders` (`store_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_store_phone` ON `orders` (`store_id`,`ship_phone`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`provider` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'unpaid' NOT NULL,
	`provider_ref` text,
	`raw` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_order` ON `payments` (`order_id`);--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`sku` text NOT NULL,
	`title` text DEFAULT 'Default' NOT NULL,
	`price` integer NOT NULL,
	`compare_at_price` integer,
	`stock` integer,
	`options` text DEFAULT '{}' NOT NULL,
	`weight_grams` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `variants_store_sku` ON `product_variants` (`store_id`,`sku`);--> statement-breakpoint
CREATE INDEX `variants_product` ON `product_variants` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`category_id` text,
	`type` text DEFAULT 'physical' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`base_price` integer NOT NULL,
	`attributes` text DEFAULT '{}' NOT NULL,
	`images` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_store_slug` ON `products` (`store_id`,`slug`);--> statement-breakpoint
CREATE INDEX `products_store_status` ON `products` (`store_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `products_store_category` ON `products` (`store_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`custom_domain` text,
	`currency` text DEFAULT 'BDT' NOT NULL,
	`locale` text DEFAULT 'bn' NOT NULL,
	`theme` text DEFAULT '{}' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`admin_token_hash` text NOT NULL,
	`next_order_number` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stores_slug_unique` ON `stores` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `stores_custom_domain_unique` ON `stores` (`custom_domain`);