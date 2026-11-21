import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import type { ProductKind } from "@soluciones-opticas/shared";

// The admin product search lives in the URL (/admin/products?sku=1007&…),
// so going into a product and coming back — with «Volver a la búsqueda» or
// the browser's Back — finds the same code, filters, page and the last
// result opened. Only search criteria: no stock, price or personal data is
// ever put in the URL or in browser storage.
//
//   sku        SKU or model code typed
//   nombre     name search
//   tipo       FRAME | ACCESSORY
//   eliminados 1 = include deleted products
//   pagina     page of whichever list is shown
//   ultimo     id of the last result opened (variant in the SKU search,
//              product in the name list), to bring it back into view

export const ADMIN_PRODUCTS_PATH = "/admin/products";

export interface AdminSearchState {
  sku: string;
  nombre: string;
  tipo: ProductKind | "";
  eliminados: boolean;
  pagina: number;
  ultimo: string | null;
}

export function readAdminSearch(params: URLSearchParams): AdminSearchState {
  const tipo = params.get("tipo");
  const pagina = Number.parseInt(params.get("pagina") ?? "", 10);
  return {
    sku: params.get("sku") ?? "",
    nombre: params.get("nombre") ?? "",
    tipo: tipo === "FRAME" || tipo === "ACCESSORY" ? tipo : "",
    eliminados: params.get("eliminados") === "1",
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
    ultimo: params.get("ultimo") || null,
  };
}

/** Only what differs from an empty search, in a stable order. */
export function adminSearchParams(state: AdminSearchState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.sku !== "") params.set("sku", state.sku);
  if (state.nombre !== "") params.set("nombre", state.nombre);
  if (state.tipo) params.set("tipo", state.tipo);
  if (state.eliminados) params.set("eliminados", "1");
  if (state.pagina > 1) params.set("pagina", String(state.pagina));
  if (state.ultimo) params.set("ultimo", state.ultimo);
  return params;
}

export function adminSearchUrl(state: AdminSearchState): string {
  const query = adminSearchParams(state).toString();
  return query ? `${ADMIN_PRODUCTS_PATH}?${query}` : ADMIN_PRODUCTS_PATH;
}

/** The search as state, and a way to change it that REPLACES the current
 * history entry (typing «1007» never leaves four Back steps behind). */
export function useAdminSearch(): [AdminSearchState, (patch: Partial<AdminSearchState>) => void] {
  const [params, setParams] = useSearchParams();
  const state = readAdminSearch(params);
  const update = useCallback(
    (patch: Partial<AdminSearchState>) =>
      setParams((current) => adminSearchParams({ ...readAdminSearch(current), ...patch }), {
        replace: true,
      }),
    [setParams],
  );
  return [state, update];
}

/** What a product page needs to offer «Volver a la búsqueda». */
export interface AdminSearchReturn {
  from: string;
  label: string;
}

export function searchReturnState(state: AdminSearchState): { adminSearch: AdminSearchReturn } {
  return {
    adminSearch: {
      from: adminSearchUrl(state),
      label: state.sku.trim() || state.nombre.trim(),
    },
  };
}

/** Reads it back, accepting only a link to the product list itself. */
export function readSearchReturn(locationState: unknown): AdminSearchReturn | null {
  const value = (locationState as { adminSearch?: unknown } | null)?.adminSearch as
    Partial<AdminSearchReturn> | undefined;
  if (!value || typeof value.from !== "string" || typeof value.label !== "string") return null;
  if (value.from !== ADMIN_PRODUCTS_PATH && !value.from.startsWith(`${ADMIN_PRODUCTS_PATH}?`)) {
    return null;
  }
  return { from: value.from, label: value.label };
}

/** Brings the last opened result back into view once it is on screen —
 * after the admin layout's own "start at the top" on navigation. */
export function useScrollToLastOpened(lastId: string | null, ready: boolean) {
  useEffect(() => {
    if (!lastId || !ready) return;
    const frame = requestAnimationFrame(() => {
      const row = [...document.querySelectorAll<HTMLElement>("[data-result-id]")].find(
        (element) => element.dataset.resultId === lastId,
      );
      try {
        row?.scrollIntoView({ block: "center" });
      } catch {
        // Not available (tests): nothing to scroll.
      }
    });
    return () => cancelAnimationFrame(frame);
    // Once per return: the id and readiness, not every refetch.
  }, [lastId, ready]);
}
