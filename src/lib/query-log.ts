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

const ROUND_TRIP_METHODS = new Set(['all', 'first', 'run', 'raw']);

function wrapStatement<T extends object>(statement: T, increment: () => void): T {
  return new Proxy(statement, {
    get(target, property, receiver) {
      const original = Reflect.get(target, property, receiver);
      if (typeof original !== 'function') return original;

      if (property === 'bind') {
        return (...args: unknown[]) =>
          wrapStatement(Reflect.apply(original, target, args) as object, increment);
      }
      if (ROUND_TRIP_METHODS.has(String(property))) {
        return (...args: unknown[]) => {
          increment();
          return Reflect.apply(original, target, args);
        };
      }
      return original.bind(target);
    },
  });
}

/**
 * Counts D1 network round trips (`all`/`first`/`run`/`batch`/`exec`), not
 * local `prepare()` calls. Drizzle/raw SQL that prepares several statements
 * still costs one round trip when sent with `batch()`.
 */
export function countRoundTrips<T extends object>(value: T): Counted<T> {
  let count = 0;
  const increment = () => {
    count += 1;
  };

  const proxy = new Proxy(value, {
    get(target, property, receiver) {
      const original = Reflect.get(target, property, receiver);
      if (typeof original !== 'function') return original;

      if (property === 'prepare') {
        return (...args: unknown[]) =>
          wrapStatement(Reflect.apply(original, target, args) as object, increment);
      }
      if (property === 'batch' || property === 'exec') {
        return (...args: unknown[]) => {
          increment();
          return Reflect.apply(original, target, args);
        };
      }
      return original.bind(target);
    },
  });

  return { value: proxy, count: () => count };
}
