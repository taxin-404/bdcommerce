ALTER TABLE `order_items` ADD `stock_tracked` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Best effort for orders placed before this migration: assume lines whose
-- product is currently tracked were decremented at checkout. Rows added after
-- this migration carry the exact checkout decision from `src/lib/checkout.ts`.
UPDATE `order_items`
   SET `stock_tracked` = 1
 WHERE `variant_id` IS NOT NULL
   AND `product_id` IN (SELECT `id` FROM `products` WHERE `track_stock` = 1);
