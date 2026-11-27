export interface VariantStockLike {
  stock: number;
}

export function isProductInStock(input: {
  trackStock: boolean;
  variants: VariantStockLike[];
}): boolean {
  if (!input.trackStock || input.variants.length === 0) return true;
  return input.variants.some((variant) => variant.stock > 0);
}

export interface VariantPriceLike {
  id: number;
  price: number;
}

/** Cheapest active variant, tie-broken by id, so cards and details agree. */
export function pickDefaultVariant<T extends VariantPriceLike>(
  variants: readonly T[],
): T | undefined {
  return [...variants].sort((first, second) => first.price - second.price || first.id - second.id)[0];
}
