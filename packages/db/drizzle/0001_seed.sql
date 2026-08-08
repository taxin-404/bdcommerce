-- Demo seed data (dev only)
-- Admin login: admin@bdcommerce.com / admin123
--> statement-breakpoint
INSERT INTO `users` (`id`, `email`, `name`, `password_hash`, `role`, `is_active`, `loyalty_points`, `created_at`, `updated_at`) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@bdcommerce.com', 'Store Admin', 'pbkdf2$sha256$120000$dc06fa252e96a5733d3527af8f25133d$3e06fead52d45d0d03e80574d097888d91e009f3b2d488fac33f45cf46f56a21', 'ADMIN', 1, 0, 1735689600000, 1735689600000);
--> statement-breakpoint
INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `sort_order`, `is_active`, `is_featured`, `created_at`, `updated_at`) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Electronics', 'electronics', 'Phones, audio, accessories and more', 1, 1, 1, 1735689600000, 1735689600000),
  ('22222222-2222-2222-2222-222222222202', 'Fashion', 'fashion', 'Clothing and accessories', 2, 1, 1, 1735689600000, 1735689600000);
--> statement-breakpoint
INSERT INTO `brands` (`id`, `name`, `slug`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES
  ('33333333-3333-3333-3333-333333333301', 'BDTech', 'bdtech', 1, 1, 1735689600000, 1735689600000),
  ('33333333-3333-3333-3333-333333333302', 'LocalWear', 'localwear', 2, 1, 1735689600000, 1735689600000);
--> statement-breakpoint
INSERT INTO `products` (`id`, `slug`, `name`, `summary`, `description`, `specifications`, `price_paisa`, `compare_at_paisa`, `cost_paisa`, `sku`, `category_id`, `brand_id`, `images`, `cover_image`, `tags`, `is_active`, `is_featured`, `is_best_seller`, `is_new_arrival`, `stock`, `low_stock_threshold`, `view_count`, `created_at`, `updated_at`) VALUES
  ('44444444-4444-4444-4444-444444444401', 'wireless-earbuds-pro', 'Wireless Earbuds Pro', 'Noise-cancelling earbuds with 30h battery', 'Crystal-clear sound with active noise cancellation and a 30-hour battery life in the case.', '[]', 249000, 299000, 180000, 'EB-PRO-BLK', '22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333301', '[]', NULL, '["earbuds","audio"]', 1, 1, 1, 1, 50, 5, 0, 1735689600000, 1735689600000),
  ('44444444-4444-4444-4444-444444444402', 'cotton-t-shirt', 'Cotton T-Shirt', 'Soft 100% cotton unisex tee', 'Everyday comfort in premium 100% cotton. Machine washable.', '[]', 59000, 69000, 35000, 'TSH-COT-001', '22222222-2222-2222-2222-222222222202', '33333333-3333-3333-3333-333333333302', '[]', NULL, '["tshirt","cotton"]', 1, 0, 1, 0, 100, 10, 0, 1735689600000, 1735689600000);
--> statement-breakpoint
INSERT INTO `product_variants` (`id`, `product_id`, `name`, `options`, `sku`, `price_paisa`, `stock`, `is_active`, `created_at`, `updated_at`) VALUES
  ('55555555-5555-5555-5555-555555555501', '44444444-4444-4444-4444-444444444402', 'Small', '{"size":"S"}', 'TSH-COT-S', 59000, 30, 1, 1735689600000, 1735689600000),
  ('55555555-5555-5555-5555-555555555502', '44444444-4444-4444-4444-444444444402', 'Medium', '{"size":"M"}', 'TSH-COT-M', 59000, 40, 1, 1735689600000, 1735689600000),
  ('55555555-5555-5555-5555-555555555503', '44444444-4444-4444-4444-444444444402', 'Large', '{"size":"L"}', 'TSH-COT-L', 59000, 30, 1, 1735689600000, 1735689600000);
--> statement-breakpoint
INSERT INTO `shipping_zones` (`id`, `name`, `type`, `district`, `charge_paisa`, `free_over_paisa`, `is_active`, `created_at`, `updated_at`) VALUES
  ('66666666-6666-6666-6666-666666666601', 'Inside Dhaka', 'DHAKA', 'Dhaka', 6000, 200000, 1, 1735689600000, 1735689600000),
  ('66666666-6666-6666-6666-666666666602', 'Outside Dhaka', 'OUTSIDE_DHAKA', NULL, 12000, 400000, 1, 1735689600000, 1735689600000);
--> statement-breakpoint
INSERT INTO `payment_methods` (`id`, `key`, `name`, `description`, `is_active`, `is_sandbox`, `sort_order`, `config`, `created_at`, `updated_at`) VALUES
  ('77777777-7777-7777-7777-777777777701', 'COD', 'Cash on Delivery', 'Pay in cash when your order arrives', 1, 0, 1, '{}', 1735689600000, 1735689600000),
  ('77777777-7777-7777-7777-777777777702', 'BKASH', 'bKash', 'Send money to our bKash number', 1, 1, 2, '{"number":"01700000000"}', 1735689600000, 1735689600000),
  ('77777777-7777-7777-7777-777777777703', 'NAGAD', 'Nagad', 'Send money to our Nagad number', 1, 1, 3, '{"number":"01800000000"}', 1735689600000, 1735689600000),
  ('77777777-7777-7777-7777-777777777704', 'ROCKET', 'Rocket', 'Send money via Rocket', 1, 1, 4, '{"number":"01900000000"}', 1735689600000, 1735689600000);
--> statement-breakpoint
INSERT INTO `coupons` (`id`, `code`, `type`, `value`, `min_subtotal_paisa`, `max_discount_paisa`, `usage_limit`, `used_count`, `per_user_limit`, `applies_to`, `is_active`, `created_at`, `updated_at`) VALUES
  ('88888888-8888-8888-8888-888888888801', 'WELCOME10', 'PERCENTAGE', 10, 0, 10000, 1000, 0, 1, 'ALL', 1, 1735689600000, 1735689600000);
--> statement-breakpoint
INSERT INTO `menu_items` (`id`, `label`, `url`, `type`, `location`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES
  ('99999999-9999-9999-9999-999999999901', 'Home', '/', 'URL', 'HEADER', 1, 1, 1735689600000, 1735689600000),
  ('99999999-9999-9999-9999-999999999902', 'Shop', '/products', 'URL', 'HEADER', 2, 1, 1735689600000, 1735689600000),
  ('99999999-9999-9999-9999-999999999903', 'Blog', '/blog', 'URL', 'HEADER', 3, 1, 1735689600000, 1735689600000);
--> statement-breakpoint
INSERT INTO `settings` (`id`, `key`, `value`, `updated_at`) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'site', '{"name":"BDCommerce","tagline":"Bangladesh\u0027s lightweight commerce engine","currency":"BDT","primaryColor":"#22c55e","secondaryColor":"#111827","accentColor":"#f59e0b","darkMode":false}', 1735689600000);
