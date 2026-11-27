export interface Counted<T> {
  value: T;
  count: () => number;
}

/** Counts top-level D1 calls (prepare/batch/exec) without changing behaviour. */
export function countCalls<T extends object>(value: T): Counted<T> {
  let count = 0;
  const proxy = new Proxy(value, {
    get(target, property, receiver) {
      const original = Reflect.get(target, property, receiver);
      if (typeof original !== 'function') return original;

      return (...args: unknown[]) => {
        count += 1;
        return Reflect.apply(original, target, args);
      };
    },
  });

  return { value: proxy, count: () => count };
}

export function logQueryCount(page: string, count: number): void {
  if (import.meta.env?.DEV) {
    console.info(`[queries] ${page}: ${count}`);
  }
}
