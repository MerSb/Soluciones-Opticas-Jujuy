import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useSearchParams } from "react-router-dom";
import type { ProductKind } from "@soluciones-opticas/shared";
import { SeoHead } from "../../components/ui/SeoHead";
import { useIncludedAccessoriesQuery } from "../../services/queries/products";
import { isIncludedAccessoriesDto } from "../../lib/included-accessories";
import { formatPrice } from "../../lib/format-price";
import { useAdminBrandsQuery, useAdminCategoriesQuery } from "../../services/queries/admin";
import {
  EMPTY_PROGRESS,
  MAX_TABS,
  emptyFields,
  readStoredDrafts,
  writeStoredDrafts,
  type DraftProgress,
  type ProductDraftFields,
  type StoredDraft,
} from "../../lib/product-drafts";
import { AdminProductDraftForm, type DraftTabState } from "./AdminProductDraftForm";

// New products, several at once: each tab is an independent form (the
// same fields as before, plus an optional first color with photos). All
// tabs stay mounted — switching only hides them — so typed values and
// chosen photo files are kept. Text fields are also kept in localStorage
// so a reload does not lose them; photo files are not (they cannot be).
// With a single tab, saving opens the product page, as before.

interface Tab {
  id: string;
  initialFields: ProductDraftFields;
  initialProgress: DraftProgress;
  lostPhotoCount: number;
  previouslyUploadedPhotos: number;
}

interface TabMeta {
  name: string;
  dirty: boolean;
  saved: boolean;
  saving: boolean;
}

let tabCounter = 0;
const newTabId = () => `tab-${Date.now().toString(36)}-${(tabCounter += 1)}`;

function freshTab(kind: ProductKind): Tab {
  return {
    id: newTabId(),
    initialFields: emptyFields(kind),
    initialProgress: EMPTY_PROGRESS,
    lostPhotoCount: 0,
    previouslyUploadedPhotos: 0,
  };
}

function restoredTab(draft: StoredDraft): Tab {
  return {
    id: draft.id,
    initialFields: draft.fields,
    // Photos chosen before the reload are gone: a new selection starts at 0.
    initialProgress: { ...draft.progress, uploadedPhotos: 0 },
    lostPhotoCount: draft.photoCount,
    previouslyUploadedPhotos: draft.progress.uploadedPhotos,
  };
}

export function AdminNewProductPage() {
  const navigate = useNavigate();
  // "Nuevo accesorio" in the products list links here with ?tipo=accesorio.
  const [searchParams] = useSearchParams();
  const requestedKind: ProductKind =
    searchParams.get("tipo") === "accesorio" ? "ACCESSORY" : "FRAME";
  const { data: brands } = useAdminBrandsQuery();
  const { data: categories } = useAdminCategoriesQuery();
  // ADR-0028 Phase 2 — the personalized-cord surcharge, from the API.
  const includedOffer = useIncludedAccessoriesQuery();
  const includedSurchargeText = isIncludedAccessoriesDto(includedOffer.data)
    ? formatPrice(includedOffer.data.customCord.surcharge)
    : null;

  const [restoredCount] = useState(() => readStoredDrafts().length);
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const stored = readStoredDrafts().map(restoredTab);
    if (stored.length === 0) return [freshTab(requestedKind)];
    return requestedKind === "ACCESSORY" && stored.length < MAX_TABS
      ? [...stored, freshTab("ACCESSORY")]
      : stored;
  });
  const [activeId, setActiveId] = useState(() => tabs[tabs.length - 1]!.id);
  const [meta, setMeta] = useState<Record<string, TabMeta>>({});
  const latest = useRef<Record<string, DraftTabState>>({});

  const persist = useCallback((openTabs: Tab[]) => {
    writeStoredDrafts(
      openTabs.flatMap((tab) => {
        const state = latest.current[tab.id];
        if (!state || state.saved || !state.dirty) return [];
        return [
          {
            id: tab.id,
            fields: state.fields,
            progress: state.progress,
            photoCount: state.photoCount,
          },
        ];
      }),
    );
  }, []);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const handleChange = useCallback(
    (tabId: string, state: DraftTabState) => {
      latest.current[tabId] = state;
      setMeta((current) => ({
        ...current,
        [tabId]: {
          name: state.fields.name.trim(),
          dirty: state.dirty,
          saved: state.saved,
          saving: state.saving,
        },
      }));
      persist(tabsRef.current);
    },
    [persist],
  );

  const anyDirty = Object.values(meta).some((tab) => tab.dirty || tab.saving);
  const anySaving = Object.values(meta).some((tab) => tab.saving);
  const [navigationNotice, setNavigationNotice] = useState<string | null>(null);
  // Our own redirect after a single-tab save must not be blocked.
  const allowNavigation = useRef(false);

  // Leaving for another admin page: never while a product is being saved
  // (the request would finish unseen and a retry could create it twice);
  // with unsaved changes, only after confirming (photos would be lost).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowNavigation.current && anyDirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (anySaving) {
      blocker.reset();
      setNavigationNotice("Esperá a que termine de guardarse el producto antes de salir.");
      return;
    }
    if (
      window.confirm(
        "Hay productos sin guardar. Lo escrito queda como borrador, pero las fotos elegidas se pierden. ¿Salir igual?",
      )
    ) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, anySaving]);
  useEffect(() => {
    if (!anySaving) setNavigationNotice(null);
  }, [anySaving]);

  useEffect(() => {
    if (!anyDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  function addTab() {
    if (tabs.length >= MAX_TABS) return;
    const tab = freshTab("FRAME");
    setTabs((current) => [...current, tab]);
    setActiveId(tab.id);
  }

  function closeTab(tabId: string) {
    const state = meta[tabId];
    if (state?.saving) return;
    if (
      state?.dirty &&
      !window.confirm(
        `«${state.name || "Producto sin nombre"}» tiene cambios sin guardar. ¿Cerrar la pestaña igual?`,
      )
    ) {
      return;
    }
    const remaining = tabs.filter((tab) => tab.id !== tabId);
    delete latest.current[tabId];
    setMeta((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
    if (remaining.length === 0) {
      const tab = freshTab("FRAME");
      setTabs([tab]);
      setActiveId(tab.id);
      persist([tab]);
      return;
    }
    setTabs(remaining);
    if (activeId === tabId) setActiveId(remaining[remaining.length - 1]!.id);
    persist(remaining);
  }

  function handleSaved(tabId: string, productId: string) {
    persist(tabsRef.current);
    // A single form behaves as before: straight to the new product's page.
    if (tabsRef.current.length === 1 && tabsRef.current[0]!.id === tabId) {
      allowNavigation.current = true;
      navigate(`/admin/products/${productId}`, { replace: true });
    }
  }

  const activeBrands = (brands ?? []).filter((b) => !b.deletedAt);
  const activeCategories = (categories ?? []).filter((c) => !c.deletedAt);

  return (
    <div>
      <SeoHead noIndex title="Nuevo producto — Administración" />
      <h2 className="font-display text-lg font-semibold text-text">Nuevos productos</h2>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        Podés cargar varios productos a la vez, cada uno en su pestaña. Cada pestaña se guarda por
        separado; lo que escribas se conserva al cambiar de pestaña.
      </p>
      {restoredCount > 0 && (
        <p
          role="status"
          className="mt-3 max-w-2xl rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-text"
        >
          Recuperamos {restoredCount} borrador{restoredCount === 1 ? "" : "es"} sin guardar. Las
          fotos no se conservan al recargar la página.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-1 border-b border-border">
        <div role="tablist" aria-label="Productos en carga" className="flex flex-wrap gap-1">
          {tabs.map((tab, index) => {
            const state = meta[tab.id];
            const label = state?.name || `Producto ${index + 1}`;
            const selected = tab.id === activeId;
            return (
              <div
                key={tab.id}
                className={`flex items-center rounded-t-md border border-b-0 ${
                  selected ? "border-border bg-surface" : "border-transparent bg-surface-muted"
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  id={`${tab.id}-tab`}
                  aria-selected={selected}
                  aria-controls={`${tab.id}-panel`}
                  onClick={() => setActiveId(tab.id)}
                  className={`max-w-[14rem] truncate px-3 py-2 text-sm ${
                    selected ? "font-semibold text-primary" : "text-text"
                  }`}
                >
                  {label}
                  {state?.saved && (
                    <span className="ml-1 text-success" aria-label="guardado">
                      ✓
                    </span>
                  )}
                  {state?.dirty && (
                    <span className="ml-1 text-accent" aria-label="con cambios sin guardar">
                      ●
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => closeTab(tab.id)}
                  disabled={state?.saving}
                  title={state?.saving ? "Esperá a que termine de guardarse" : undefined}
                  aria-label={`Cerrar ${label}`}
                  className="px-2 py-2 text-sm text-text-muted hover:text-danger disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addTab}
          disabled={tabs.length >= MAX_TABS}
          className="mb-1 ml-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-primary hover:bg-surface-muted disabled:opacity-50"
        >
          + Nuevo producto
        </button>
      </div>
      {navigationNotice && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {navigationNotice}
        </p>
      )}
      {tabs.length >= MAX_TABS && (
        <p className="mt-2 text-xs text-text-muted">Máximo {MAX_TABS} pestañas a la vez.</p>
      )}

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${tab.id}-panel`}
          aria-labelledby={`${tab.id}-tab`}
          hidden={tab.id !== activeId}
          className="pt-6"
        >
          <AdminProductDraftForm
            initialFields={tab.initialFields}
            initialProgress={tab.initialProgress}
            lostPhotoCount={tab.lostPhotoCount}
            previouslyUploadedPhotos={tab.previouslyUploadedPhotos}
            brands={activeBrands}
            categories={activeCategories}
            includedSurchargeText={includedSurchargeText}
            onChange={(state) => handleChange(tab.id, state)}
            onSaved={(productId) => handleSaved(tab.id, productId)}
          />
        </div>
      ))}
    </div>
  );
}
