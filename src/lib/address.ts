export interface OrderAddressParts {
  address: string;
  upazila?: string | null;
  district?: string | null;
  division?: string | null;
}

/**
 * Builds a readable delivery address without repeating a locality the customer
 * already typed into the street address (e.g. "House 1, Savar" + upazila Savar).
 */
export function formatOrderAddress(input: OrderAddressParts): string {
  const base = input.address.trim();
  const lowerBase = base.toLowerCase();
  const seen = new Set<string>(lowerBase ? [lowerBase] : []);
  const parts: string[] = [];

  for (const value of [input.upazila, input.district, input.division]) {
    const part = value?.trim();
    if (!part) continue;
    const key = part.toLowerCase();
    if (seen.has(key) || lowerBase.includes(key)) continue;
    seen.add(key);
    parts.push(part);
  }

  return [base, ...parts].filter(Boolean).join(', ');
}
