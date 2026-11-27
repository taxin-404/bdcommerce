import { Hono } from 'hono';
import { isValidImageKey } from '../../lib/image';

export const imageRoutes = new Hono<{ Bindings: Env }>();

imageRoutes.get('/*', async (c) => {
  const pathname = new URL(c.req.url).pathname;
  let key: string;
  try {
    key = decodeURIComponent(pathname.replace(/^\/img\//, ''));
  } catch {
    return c.text('Not found', 404);
  }

  if (!isValidImageKey(key)) return c.text('Not found', 404);

  const object = await c.env.IMAGES.get(key);
  if (!object) return c.text('Not found', 404);

  const etag = object.httpEtag;
  if (c.req.header('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { etag, 'cache-control': 'public, max-age=31536000, immutable' },
    });
  }

  return new Response(object.body, {
    headers: {
      'content-type': 'image/webp',
      'content-length': String(object.size),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      etag,
    },
  });
});
