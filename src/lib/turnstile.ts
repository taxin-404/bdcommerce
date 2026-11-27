const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5000;

export interface TurnstileKeys {
  siteKey: string;
  secretKey: string;
}

export interface TurnstileConfig extends TurnstileKeys {
  enabled: boolean;
}

/** Turnstile is optional: it runs only when both keys are configured. */
export function readTurnstileConfig(env: {
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}): TurnstileConfig {
  const siteKey = (env.TURNSTILE_SITE_KEY ?? '').trim();
  const secretKey = (env.TURNSTILE_SECRET_KEY ?? '').trim();
  return { siteKey, secretKey, enabled: Boolean(siteKey && secretKey) };
}

export type TurnstileVerification =
  | { ok: true; degraded: boolean }
  | { ok: false; codes: string[] };

interface SiteverifyResponse {
  success?: boolean;
  'error-codes'?: string[];
}

/**
 * Invalid tokens fail closed. A Siteverify outage or timeout fails open so a
 * Cloudflare incident cannot take checkout down (the app is fail-soft).
 */
export async function verifyTurnstile(input: {
  secretKey: string;
  token: string | null | undefined;
  remoteIp?: string | null;
  fetcher?: typeof fetch;
}): Promise<TurnstileVerification> {
  const token = (input.token ?? '').trim();
  if (!token) return { ok: false, codes: ['missing-input-response'] };

  const body = new FormData();
  body.append('secret', input.secretKey);
  body.append('response', token.slice(0, 2048));
  if (input.remoteIp) body.append('remoteip', input.remoteIp);

  const fetcher = input.fetcher ?? globalThis.fetch.bind(globalThis);

  try {
    const response = await fetcher(SITEVERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });

    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) {
        console.warn(`Turnstile siteverify returned HTTP ${response.status}; allowing checkout`);
        return { ok: true, degraded: true };
      }
      console.error(`Turnstile siteverify rejected the request with HTTP ${response.status}`);
      return { ok: false, codes: [`http-${response.status}`] };
    }

    const data = (await response.json()) as SiteverifyResponse;
    if (data.success) return { ok: true, degraded: false };

    const codes = data['error-codes'] ?? ['invalid-input-response'];
    if (codes.includes('internal-error')) {
      console.warn('Turnstile siteverify reported an outage; allowing checkout');
      return { ok: true, degraded: true };
    }

    return { ok: false, codes };
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown';
    console.warn(`Turnstile siteverify unavailable (${reason}); allowing checkout`);
    return { ok: true, degraded: true };
  }
}
