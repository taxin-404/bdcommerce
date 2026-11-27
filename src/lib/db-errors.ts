export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Heuristics for D1 quota exhaustion, outages, and local network failures. */
export function isD1Unavailable(error: unknown): boolean {
  const message = errorMessage(error);
  if (/constraint failed|SQLITE_CONSTRAINT/i.test(message)) return false;
  return /D1_ERROR|Network connection lost|network error|database is locked|no such table|Failed to fetch|storage (error|failure)|internal error/i.test(
    message,
  );
}
