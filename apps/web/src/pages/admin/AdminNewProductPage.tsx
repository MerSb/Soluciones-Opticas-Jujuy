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
  emptyFields,
  readStoredDrafts,
  writeStoredDrafts,
  type StoredDraft,
} from "../../lib/product-drafts";
import { AdminProductDraftForm, type DraftState } from "./AdminProductDraftForm";

// «Nuevo producto»: one product at a time, on one page (docs/ALTA_PRODUCTOS.md).
// What is typed is kept in localStorage, so a reload does not lose it
// (photo files are not: they cannot be). Drafts left from the former
// multi-tab page stay stored and can be resumed one by one. Saving opens
// the new product's page, at the top, saying it was created.

interface ActiveDraft {
  draft: StoredDraft;
  /** Restored from storage (photos chosen before cannot come back). */
  restored: boolean;
}

let draftCounter = 0;
const newDraftId = () => `draft-${Date.now().toString(36)}-${(draftCounter += 1)}`;

function freshDraft(kind: ProductKind): ActiveDraft {
  return {
    draft: { id: newDraftId(), fields: emptyFields(kind), progress: EMPTY_PROGRESS, photoCount: 0 },
    restored: false,
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

  // The stored drafts this page is not editing right now.
  const [others, setOthers] = useState<StoredDraft[]>(() => readStoredDrafts());
  const [active, setActive] = useState<ActiveDraft>(() => {
    const stored = readStoredDrafts();
    // A requested accessory starts fresh; the stored drafts stay listed.
    if (stored.length === 0 || requestedKind === "ACCESSORY") return freshDraft(requestedKind);
    return { draft: stored[0]!, restored: true };
  });
  const [restoredCount] = useState(() => readStoredDrafts().length);
  useEffect(() => {
    setOthers((current) => current.filter((draft) => draft.id !== active.draft.id));
  }, [active.draft.id]);

  const [state, setState] = useState<DraftState | null>(null);
  const latest = useRef<DraftState | null>(null);
  const othersRef = useRef(others);
  othersRef.current = others;

  const persist = useCallback((current: DraftState | null, draftId: string) => {
    const kept = othersRef.current.filter((draft) => draft.id !== draftId);
    writeStoredDrafts(
      current && current.dirty && !current.saved
        ? [
            {
              id: draftId,
              fields: current.fields,
              progress: current.progress,
              photoCount: current.photoCount,
            },
            ...kept,
          ]
        : kept,
    );
  }, []);

  const activeIdRef = useRef(active.draft.id);
  activeIdRef.current = active.draft.id;
  const handleChange = useCallback(
    (next: DraftState) => {
      latest.current = next;
      setState(next);
      persist(next, activeIdRef.current);
    },
    [persist],
  );

  const dirty = Boolean(state && (state.dirty || state.saving));
  const saving = Boolean(state?.saving);
  const [navigationNotice, setNavigationNotice] = useState<string | null>(null);
  // Our own redirect after saving must not be blocked.
  const allowNavigation = useRef(false);

  // Leaving for another admin page: never while the product is being saved
  // (the request would finish unseen and a retry could create it twice);
  // with unsaved changes, only after confirming (photos would be lost).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowNavigation.current && dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (saving) {
      blocker.reset();
      setNavigationNotice("Esperá a que termine de guardarse el producto antes de salir.");
      return;
    }
    if (
      window.confirm(
        "Hay un producto sin guardar. Lo escrito queda como borrador, pero las fotos elegidas se pierden. ¿Salir igual?",
      )
    ) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, saving]);
  useEffect(() => {
    if (!saving) setNavigationNotice(null);
  }, [saving]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Another stored draft: the one being edited stays stored (if anything
  // was typed) and the chosen one opens.
  function resume(draft: StoredDraft) {
    if (saving) return;
    if (
      (latest.current?.photoCount ?? 0) > 0 &&
      !window.confirm("Las fotos elegidas en este producto se pierden al cambiar. ¿Seguir?")
    ) {
      return;
    }
    const current = latest.current;
    const currentId = active.draft.id;
    if (current && current.dirty && !current.saved) {
      setOthers((list) => [
        { id: currentId, fields: current.fields, progress: current.progress, photoCount: 0 },
        ...list.filter((d) => d.id !== currentId && d.id !== draft.id),
      ]);
    }
    latest.current = null;
    setState(null);
    setActive({ draft, restored: true });
  }

  function discard(draft: StoredDraft) {
    if (
      !window.confirm(`¿Descartar el borrador «${draft.fields.name || "Producto sin nombre"}»?`)
    ) {
      return;
    }
    const kept = others.filter((d) => d.id !== draft.id);
    setOthers(kept);
    othersRef.current = kept;
    persist(latest.current, active.draft.id);
  }

  function handleSaved(productId: string) {
    persist(null, active.draft.id);
    allowNavigation.current = true;
    navigate(`/admin/products/${productId}`, {
      replace: true,
      state: { created: latest.current?.fields.name.trim() || true },
    });
  }

  const activeBrands = (brands ?? []).filter((b) => !b.deletedAt);
  const activeCategories = (categories ?? []).filter((c) => !c.deletedAt);
  const { draft, restored } = active;

  return (
    <div>
      <SeoHead noIndex title="Nuevo producto — Administración" />
      <h2 className="font-display text-lg font-semibold text-text">
        {state?.fields.kind === "ACCESSORY" ? "Nuevo accesorio" : "Nuevo producto"}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        Completá las secciones y tocá «Crear producto» al final. Lo que escribas se guarda como
        borrador mientras tanto.
      </p>
      {restoredCount > 0 && restored && (
        <p
          role="status"
          className="mt-3 max-w-2xl rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-text"
        >
          Recuperamos un borrador sin guardar. Las fotos no se conservan al recargar la página.
        </p>
      )}
      {others.length > 0 && (
        <div className="mt-3 max-w-2xl rounded-md border border-border px-3 py-2 text-sm text-text">
          <p className="font-medium">
            {others.length === 1 ? "Otro borrador guardado:" : "Otros borradores guardados:"}
          </p>
          <ul className="mt-1 space-y-1">
            {others.map((other) => (
              <li key={other.id} className="flex flex-wrap items-center gap-x-3">
                <span>«{other.fields.name.trim() || "Producto sin nombre"}»</span>
                <button
                  type="button"
                  onClick={() => resume(other)}
                  disabled={saving}
                  className="min-h-11 font-medium text-primary hover:underline disabled:opacity-60"
                >
                  Continuar con este
                </button>
                <button
                  type="button"
                  onClick={() => discard(other)}
                  disabled={saving}
                  className="min-h-11 text-text-muted hover:text-danger disabled:opacity-60"
                >
                  Descartar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {navigationNotice && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {navigationNotice}
        </p>
      )}

      <div className="pt-6">
        <AdminProductDraftForm
          key={draft.id}
          initialFields={draft.fields}
          initialProgress={
            restored
              ? // Photos chosen before the reload are gone: a new selection starts at 0.
                { ...draft.progress, uploadedPhotos: draft.progress.uploadedPhotos.map(() => 0) }
              : draft.progress
          }
          lostPhotoCount={restored ? draft.photoCount : 0}
          previouslyUploadedPhotos={restored ? draft.progress.uploadedPhotos : []}
          brands={activeBrands}
          categories={activeCategories}
          includedSurchargeText={includedSurchargeText}
          onChange={handleChange}
          onSaved={handleSaved}
        />
      </div>
    </div>
  );
}
