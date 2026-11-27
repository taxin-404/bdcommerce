import type { Context } from 'hono';

type ValidationIssues = {
  issues: Array<{ path: PropertyKey[]; message: string }>;
};

/** Public API responses keep the `{ ok, error }` envelope for Zod failures. */
export function validationErrorResponse(c: Context, error: ValidationIssues) {
  return c.json(
    {
      ok: false as const,
      error: {
        code: 'validation_error',
        message: 'Invalid input',
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    },
    400,
  );
}

export function badRequest(c: Context, code: string, message: string) {
  return c.json({ ok: false as const, error: { code, message } }, 400);
}

export function notFound(c: Context, code: string, message: string) {
  return c.json({ ok: false as const, error: { code, message } }, 404);
}

export function serverUnavailable(
  c: Context,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return c.json(
    { ok: false as const, error: { code, message, ...extra } },
    503,
  );
}
