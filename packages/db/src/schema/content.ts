import { sqliteTable, text, integer, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { newId } from "../id";
import { timestamps } from "./util";
import { users } from "./people";

// ---------------------------------------------------------------------------
// Blog
// ---------------------------------------------------------------------------

export const blogCategories = sqliteTable("blog_categories", {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const blogPosts = sqliteTable("blog_posts", {
  id: text("id").primaryKey().$defaultFn(newId),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content"),
  coverImage: text("cover_image"),
  categoryId: text("category_id").references(() => blogCategories.id, { onDelete: "set null" }),
  authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
  isPublished: integer("is_published", { mode: "boolean" }).notNull().default(false),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Banners & promotional content
// ---------------------------------------------------------------------------

export const banners = sqliteTable("banners", {
  id: text("id").primaryKey().$defaultFn(newId),
  title: text("title"),
  subtitle: text("subtitle"),
  image: text("image"),
  link: text("link"),
  position: text("position").notNull().default("HOMEPAGE_HERO"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  ...timestamps,
});

export const testimonials = sqliteTable("testimonials", {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  role: text("role"),
  content: text("content").notNull(),
  rating: integer("rating").notNull().default(5),
  image: text("image"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Pages & navigation
// ---------------------------------------------------------------------------

export const pages = sqliteTable("pages", {
  id: text("id").primaryKey().$defaultFn(newId),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  content: text("content"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  isPublished: integer("is_published", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const menuItems = sqliteTable("menu_items", {
  id: text("id").primaryKey().$defaultFn(newId),
  label: text("label").notNull(),
  url: text("url").notNull(),
  type: text("type").notNull().default("URL"), // URL|PRODUCT|CATEGORY|PAGE
  location: text("location").notNull().default("HEADER"), // HEADER|FOOTER
  sortOrder: integer("sort_order").notNull().default(0),
  parentId: text("parent_id").references((): AnySQLiteColumn => menuItems.id, { onDelete: "cascade" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Engagement
// ---------------------------------------------------------------------------

export const newsletterSubscribers = sqliteTable("newsletter_subscribers", {
  id: text("id").primaryKey().$defaultFn(newId),
  email: text("email").notNull().unique(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey().$defaultFn(newId),
  type: text("type").notNull().default("ORDER"),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const contactMessages = sqliteTable("contact_messages", {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  subject: text("subject"),
  message: text("message").notNull(),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
