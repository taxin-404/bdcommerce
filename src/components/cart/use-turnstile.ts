import { useEffect, useRef, useState } from 'preact/hooks';

interface TurnstileApi {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      theme?: 'auto' | 'light' | 'dark';
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    },
  ): string;
  remove(widgetId: string): void;
  reset(widgetId?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('turnstile_script')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.dataset.turnstile = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile_script'));
    document.head.appendChild(script);
  }).catch((error) => {
    // Remove the failed tag so the next attempt can append a fresh one.
    document.querySelector<HTMLScriptElement>('script[data-turnstile]')?.remove();
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

export function useTurnstile(siteKey: string, active = true) {
  const [token, setToken] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active || !siteKey || !containerRef.current) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'auto',
          callback: (value) => setToken(value),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        });
      })
      .catch(() => {
        setToken(null);
        if (!cancelled && retryTick < 2) {
          retryTimer = setTimeout(() => setRetryTick((value) => value + 1), 2500);
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, active, retryTick]);

  const reset = () => {
    setToken(null);
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  };

  return { token, containerRef, reset };
}
