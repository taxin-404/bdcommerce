import { Hono } from "hono";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { media } from "@bd/db";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { ok, HttpError } from "../lib/http";
import { paginated, paginationFromQuery, likeTerm } from "../lib/query";
import { requireAdmin } from "../middleware/auth";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "application/pdf",
]);

const MAX_SIZE = 15 * 1024 * 1024; // 15MB

function safeExt(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name);
  return m ? m[1]!.toLowerCase() : "bin";
}

export const mediaRoutes = new Hono<AppEnv>()
  // ---- Upload (admin) ------------------------------------------------------
  .post("/", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const form = await c.req.formData();
    const file = form.get("file") as File | null;
    if (!file) throw new HttpError(400, "file field required (multipart)");

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength === 0) throw new HttpError(400, "Empty file");
    if (bytes.byteLength > MAX_SIZE) throw new HttpError(413, "File too large (max 15MB)");
    if (!ALLOWED_MIME.has(file.type)) throw new HttpError(415, `Unsupported type ${file.type}`);

    const folder = (form.get("folder") as string | null) || "media";
    const id = crypto.randomUUID();
    const key = `${folder}/${id}.${safeExt(file.name)}`;
    const url = key;

    await c.env.R2.put(key, bytes, {
      httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
    });

    const row = (
      await db
        .insert(media)
        .values({
          filename: key,
          originalName: file.name,
          mimeType: file.type,
          size: bytes.byteLength,
          url,
          folder,
          alt: (form.get("alt") as string | null) ?? null,
        })
        .returning()
    )[0]!;

    return ok(c, { id: row.id, url: row.url, filename: row.filename, mimeType: row.mimeType, size: row.size }, undefined, 201);
  })

  // ---- Serve (public, CDN-friendly) -----------------------------------------
  .get("/:key{.+}", async (c) => {
    const key = c.req.param("key") || "";
    const object = await c.env.R2.get(key);
    if (!object) throw new HttpError(404, "File not found");
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
    if (object.httpMetadata?.contentType?.startsWith("image/")) {
      headers.set("Accept-Ranges", "bytes");
    }
    return c.body(object.body, { headers });
  })

  // ---- List / delete (admin) -------------------------------------------------
  .get("/", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const q = new URL(c.req.url);
    const { page, pageSize } = paginationFromQuery(q.searchParams, 48);
    const search = q.searchParams.get("search");
    const folder = q.searchParams.get("folder");
    const conditions = [
      search ? like(media.originalName, likeTerm(search)) : undefined,
      folder ? eq(media.folder, folder) : undefined,
    ].filter(Boolean);

    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(media).where(conditions.length ? and(...(conditions as any)) : undefined),
      db
        .select()
        .from(media)
        .where(conditions.length ? and(...(conditions as any)) : undefined)
        .orderBy(desc(media.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    return ok(
      c,
      paginated(
        rows.map((m) => ({
          id: m.id,
          url: m.url,
          filename: m.filename,
          originalName: m.originalName,
          mimeType: m.mimeType,
          size: m.size,
          folder: m.folder,
          alt: m.alt,
          createdAt: m.createdAt.getTime(),
        })),
        page,
        pageSize,
        totalRows[0]?.count ?? 0,
      ),
    );
  })

  .get("/folders", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const rows = await db.select({ folder: media.folder, n: sql<number>`COUNT(*)` }).from(media).groupBy(media.folder);
    return ok(c, rows);
  })

  .delete("/:id", requireAdmin, async (c) => {
    const db = getDb(c.env);
    const row = (await db.select().from(media).where(eq(media.id, c.req.param("id"))).limit(1))[0];
    if (!row) throw new HttpError(404, "Media not found");
    await c.env.R2.delete(row.url.replace(/^\//, "")).catch(() => {});
    await db.delete(media).where(eq(media.id, row.id));
    return ok(c, { deleted: true });
  });
