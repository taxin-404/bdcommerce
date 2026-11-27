const PHONE_PATTERN = /^(?:\+?88)?01[3-9]\d{8}$/;

export function normalizePhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s\-()]/g, '');
  if (!PHONE_PATTERN.test(cleaned)) return null;
  return cleaned.slice(-11);
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}
