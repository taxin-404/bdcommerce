import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { newId } from "../id";
import { timestamps } from "./util";

// ---------------------------------------------------------------------------
// People & auth
// ---------------------------------------------------------------------------

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(newId),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("CUSTOMER"), // CUSTOMER | ADMIN | STAFF
  avatar: text("avatar"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  loyaltyPoints: integer("loyalty_points").notNull().default(0),
  ...timestamps,
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey().$defaultFn(newId),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  userAgent: text("user_agent"),
  ip: text("ip"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const addresses = sqliteTable("addresses", {
  id: text("id").primaryKey().$defaultFn(newId),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("SHIPPING"), // SHIPPING | BILLING
  label: text("label"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  company: text("company"),
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city").notNull(),
  district: text("district").notNull(),
  upazila: text("upazila"),
  postalCode: text("postal_code"),
  phone: text("phone").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});
