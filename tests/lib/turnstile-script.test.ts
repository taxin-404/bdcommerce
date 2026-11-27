import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTurnstileScript } from '../../src/components/cart/use-turnstile';

class FakeScript {
  dataset: Record<string, string> = {};
  src = '';
  async = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  removed = false;

  addEventListener() {}
  remove() {
    this.removed = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Turnstile script loader', () => {
  it('removes a failed script and appends a fresh one on the next attempt', async () => {
    const scripts: FakeScript[] = [];
    const fakeDocument = {
      head: {
        appendChild(node: FakeScript) {
          scripts.push(node);
        },
      },
      createElement: () => new FakeScript(),
      querySelector: () => scripts.find((script) => !script.removed) ?? null,
    };

    vi.stubGlobal('window', {});
    vi.stubGlobal('document', fakeDocument);

    const first = loadTurnstileScript();
    const failedScript = scripts[0];
    expect(failedScript).toBeDefined();
    failedScript?.onerror?.();
    await expect(first).rejects.toThrow('turnstile_script');
    expect(failedScript?.removed).toBe(true);

    const second = loadTurnstileScript();
    expect(scripts).toHaveLength(2);
    scripts[1]?.onload?.();
    await expect(second).resolves.toBeUndefined();
  });
});
