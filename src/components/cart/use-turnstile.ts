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

export type TurnstileStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useTurnstile(siteKey: string, active = true) {
  const [token, setToken] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [status, setStatus] = useState<TurnstileStatus>(
    active && siteKey ? 'loading' : 'idle',
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active || !siteKey || !containerRef.current) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let renderTimer: ReturnType<typeof setTimeout> | undefined;
    setStatus('loading');

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'auto',
          callback: (value) => {
            if (renderTimer) clearTimeout(renderTimer);
            setToken(value);
            setStatus('ready');
          },
          'expired-callback': () => setToken(null),
          'error-callback': () => {
            if (renderTimer) clearTimeout(renderTimer);
            setToken(null);
            setStatus('error');
          },
        });
        // A widget that renders but never calls back must not leave checkout
        // stuck on "loading" with no retry path.
        renderTimer = setTimeout(() => {
          if (!cancelled) {
            setToken(null);
            setStatus('error');
          }
        }, 15_000);
        setStatus('ready');
      })
      .catch(() => {
        setToken(null);
        if (!cancelled && retryTick < 2) {
          retryTimer = setTimeout(() => setRetryTick((value) => value + 1), 2500);
        } else if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (renderTimer) clearTimeout(renderTimer);
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

  const retry = () => {
    setToken(null);
    setStatus('loading');
    setRetryTick((value) => value + 1);
  };

  return { token, containerRef, reset, status, retry };
}
