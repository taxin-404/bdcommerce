import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { app } from '../../api/app';

export const ALL: APIRoute = ({ request, locals }) =>
  app.fetch(request, env, locals.cfContext);
