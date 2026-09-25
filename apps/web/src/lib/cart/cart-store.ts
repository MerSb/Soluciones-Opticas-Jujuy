import { useSyncExternalStore } from "react";
import {
  addCartLine,
  cartEstimatedSubtotal,
  cartItemCount,
  parseStoredCart,
  removeCartLine,
  serializeCart,
  updateCartLineQuantity,
  type AddResult,
  type CartLine,
  type CartLineInput,
} from "./cart";

// The cart's single source of truth: a tiny external store read through
// React's own useSyncExternalStore — no provider to mount, no state
// library. Every component (header badge, product page, cart,
// checkout) sees the same snapshot and re-renders on change. Persisted
// to localStorage (it survives a refresh and a closed tab — it holds no
// secret, only ids and display snapshots); other tabs follow through
// the `storage` event. Storage access is best-effort: private modes or
// full quotas degrade to an in-memory cart, never an error.

export const CART_STORAGE_KEY = "soj:cart";

let lines: CartLine[] | null = null;
const listeners = new Set<() => void>();

function readStorage(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    const parsed = parseStoredCart(raw);
    // A corrupt or outdated value is replaced by the clean one now.
    if (raw !== null && raw !== serializeCart(parsed)) {
      if (parsed.length === 0) window.localStorage.removeItem(CART_STORAGE_KEY);
      else window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(parsed));
    }
    return parsed;
  } catch {
    return [];
  }
}

function getSnapshot(): CartLine[] {
  if (lines === null) lines = readStorage();
  return lines;
}

const EMPTY: CartLine[] = [];
const getServerSnapshot = () => EMPTY;

function commit(next: CartLine[]): void {
  lines = next;
  try {
    if (next.length === 0) window.localStorage.removeItem(CART_STORAGE_KEY);
    else window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(next));
  } catch {
    // In-memory only for this page view.
  }
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== CART_STORAGE_KEY) return;
  lines = readStorage();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export const cartActions = {
  add(input: CartLineInput): AddResult {
    const { lines: next, result } = addCartLine(getSnapshot(), input);
    if (result !== "full") commit(next);
    return result;
  },
  updateQuantity(key: string, quantity: number): void {
    commit(updateCartLineQuantity(getSnapshot(), key, quantity));
  },
  remove(key: string): void {
    commit(removeCartLine(getSnapshot(), key));
  },
  clear(): void {
    commit([]);
  },
};

export function useCart() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    lines: current,
    itemCount: cartItemCount(current),
    estimatedSubtotal: cartEstimatedSubtotal(current),
    ...cartActions,
  };
}

/** Tests only: forget the in-memory snapshot so the next read comes
 * from (the test's) localStorage again. */
export function resetCartStoreForTests(): void {
  lines = null;
}
