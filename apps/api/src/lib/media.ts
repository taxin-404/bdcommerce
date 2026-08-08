import type { Env } from "../env";

// Media URL helper: media rows store relative R2 keys. They are served either
// from a public R2 domain (R2_PUBLIC_URL) or through the API's /media/:key
// route. Absolute URLs are returned so storefront/admin apps can render them
// directly regardless of origin.
export function mediaUrl(env: Env, baseUrl: string, path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith("//")) return path.startsWith("//") ? `https:${path}` : path;
  const origin = env.R2_PUBLIC_URL ? env.R2_PUBLIC_URL.replace(/\/$/, "") : baseUrl;
  return `${origin}/media/${path.replace(/^\/+/, "")}`;
}
