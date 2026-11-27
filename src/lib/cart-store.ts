import {
  CART_STORAGE_KEY,
  cartLineKey,
  mergeCartLine,
  parseStoredCart,
  removeCartLine,
  updateCartQty,
  type CartLineInput,
  type StoredCartLine,
} from './cart';

const CART_EVENT = 'bd-cart-change';

export function readCart(): StoredCartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    return raw ? parseStoredCart(JSON.parse(raw) as unknown) : [];
  } catch {
    return [];
  }
}

function writeCart(lines: StoredCartLine[]): StoredCartLine[] {
  if (typeof window === 'undefined') return lines;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage can be full or disabled; the in-memory UI still reflects the change.
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: lines }));
  return lines;
}

export function subscribeCart(listener: (lines: StoredCartLine[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onChange = (event: Event) => {
    if (event instanceof CustomEvent) {
      listener(parseStoredCart(event.detail));
    } else {
      listener(readCart());
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === CART_STORAGE_KEY) listener(readCart());
  };

  window.addEventListener(CART_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CART_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function addCartLine(input: {
  productId: number;
  variantId: number | null;
  qty: number;
  slug: string;
  title: string;
  variantTitle: string | null;
  unitPrice: number;
  image: string | null;
}): { lines: StoredCartLine[]; added: boolean; count: number } {
  const incoming: StoredCartLine = {
    key: cartLineKey(input.productId, input.variantId),
    product_id: input.productId,
    variant_id: input.variantId,
    qty: input.qty,
    slug: input.slug,
    title: input.title,
    variant_title: input.variantTitle,
    unit_price: input.unitPrice,
    image: input.image,
  };
  const current = readCart();
  const next = mergeCartLine(current, incoming);
  const added = next.some((line) => line.key === incoming.key);
  const lines = writeCart(next);
  return {
    lines,
    added,
    count: lines.reduce((total, line) => total + line.qty, 0),
  };
}

export function setCartQty(key: string, qty: number): StoredCartLine[] {
  return writeCart(updateCartQty(readCart(), key, qty));
}

export function deleteCartLine(key: string): StoredCartLine[] {
  return writeCart(removeCartLine(readCart(), key));
}

export function clearCart(): void {
  writeCart([]);
}

export function cartItemInputs(lines: readonly StoredCartLine[]): CartLineInput[] {
  return lines.map((line) => ({
    product_id: line.product_id,
    variant_id: line.variant_id,
    qty: line.qty,
  }));
}
