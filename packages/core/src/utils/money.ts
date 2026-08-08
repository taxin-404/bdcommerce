// Prices are stored as integer paisa (৳ has no decimals). 100 paisa = ৳1.

export const PAISA_PER_UNIT = 100;

export function toPaisa(amount: number): number {
  return Math.round(amount * PAISA_PER_UNIT);
}

export function fromPaisa(paisa: number): number {
  return paisa / PAISA_PER_UNIT;
}

export function formatPaisa(paisa: number): string {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(fromPaisa(paisa));
}

export function formatNumber(paisa: number): string {
  return new Intl.NumberFormat("en-BD").format(fromPaisa(paisa));
}

export function formatCompact(paisa: number): string {
  return new Intl.NumberFormat("en-BD", { notation: "compact" }).format(fromPaisa(paisa));
}

export function discountPercent(pricePaisa: number, compareAtPaisa: number | null | undefined): number | null {
  if (!compareAtPaisa || compareAtPaisa <= pricePaisa || pricePaisa <= 0) return null;
  return Math.round(((compareAtPaisa - pricePaisa) / compareAtPaisa) * 100);
}
