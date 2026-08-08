import { Hono } from "hono";
import { logger } from "hono/logger";
import type { AppEnv } from "./env";
import { errorHandler, securityHeaders, corsSecurity } from "./middleware/security";
import { ipRateLimit } from "./middleware/rate-limit";
import { authRoutes } from "./routes/auth";
import { cartRoutes } from "./routes/cart";
import { catalogRoutes } from "./routes/catalog";
import { checkoutRoutes } from "./routes/checkout";
import { orderRoutes } from "./routes/orders";
import { wishlistRoutes } from "./routes/wishlist";
import { accountRoutes } from "./routes/account";
import { reviewRoutes } from "./routes/reviews";
import { couponRoutes } from "./routes/coupons";
import { contentRoutes } from "./routes/content";
import { miscRoutes } from "./routes/misc";
import { mediaRoutes } from "./routes/media";
import { healthRoutes } from "./routes/health";
import { dashboardRoutes } from "./routes/dashboard";
import { adminCatalogRoutes } from "./routes/admin-catalog";
import { adminOrderRoutes } from "./routes/admin-orders";
import { adminContentRoutes } from "./routes/admin-content";
import { adminUserRoutes } from "./routes/admin-users";

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use("*", securityHeaders());
app.use("*", corsSecurity());
app.use("*", ipRateLimit(300, 60));
app.onError(errorHandler);
app.notFound((c) => c.json({ ok: false, error: "Not found", message: "Route not found" }, 404));

// Public + customer-facing API
app.route("/api/v1", authRoutes);
app.route("/api/v1", catalogRoutes);
app.route("/api/v1", miscRoutes);
app.route("/api/v1/cart", cartRoutes);
app.route("/api/v1/checkout", checkoutRoutes);
app.route("/api/v1/orders", orderRoutes);
app.route("/api/v1/wishlist", wishlistRoutes);
app.route("/api/v1/account", accountRoutes);
app.route("/api/v1/reviews", reviewRoutes);
app.route("/api/v1/coupons", couponRoutes);
app.route("/api/v1/content", contentRoutes);

// Admin API (requireAdmin enforced per-route)
app.route("/api/admin", adminCatalogRoutes);
app.route("/api/admin/orders", adminOrderRoutes);
app.route("/api/admin", adminContentRoutes);
app.route("/api/admin", adminUserRoutes);
app.route("/api/admin", dashboardRoutes);

// Media & health
app.route("/media", mediaRoutes);
app.route("/health", healthRoutes);

app.get("/", (c) =>
  c.json({
    ok: true,
    service: "bdcommerce-api",
    version: "1.0.0",
    routes: ["/health", "/api/v1", "/api/admin", "/media"],
  }),
);

export default app;
