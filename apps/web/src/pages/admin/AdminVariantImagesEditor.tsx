import { useEffect, useId, useRef, useState } from "react";
import type { AdminImageDto } from "@soluciones-opticas/shared";
import { ProductImage } from "../../components/products/ProductImage";
import { ApiClientError } from "../../services/api-client";
import { CLOUDINARY_WIDTHS } from "../../lib/cloudinary";
import {
  useDeleteImageMutation,
  useReorderImagesMutation,
  useUpdateImageMutation,
} from "../../services/queries/admin";
import { AdminImageUploadForm } from "./AdminImageUploadForm";

type MoveDirection = "up" | "down";

const GENERIC_ERROR = "No pudimos guardar el cambio. Intentá de nuevo.";
const NOT_FOUND_ERROR =
  "No encontramos esta foto o variante. Puede haber cambiado en otra pestaña: recargá la página.";
const NETWORK_ERROR = "No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.";
export const PRIMARY_STAYS_FIRST =
  "La foto principal siempre va primera. Para cambiarla, usá «Marcar como principal» en otra foto.";

// Our API's 4xx messages are curated Spanish (e.g. the 409 for a stale
// order); 5xx bodies and provider errors are never shown as-is.
function describeError(error: unknown): string {
  if (error instanceof ApiClientError) {
    // The generic 404 body is English (route or record not found — e.g. the
    // photo was deleted in another tab), so it gets its own sentence.
    if (error.status === 404) return NOT_FOUND_ERROR;
    return error.status < 500 ? error.message : GENERIC_ERROR;
  }
  if (error instanceof TypeError) return NETWORK_ERROR;
  return GENERIC_ERROR;
}

// The primary is always first (API rule), so the photo promoted when it is
// deleted is the second one.
function deleteConfirmation(image: AdminImageDto, next: AdminImageDto | undefined): string {
  const intro = `¿Eliminar la foto «${image.alt}»?`;
  const primary =
    image.isPrimary && next
      ? ` Es la foto principal: «${next.alt}» pasará a ser la principal y quedará primera.`
      : "";
  return `${intro}${primary} Esta acción no se puede deshacer.`;
}

function ArrowIcon({ direction }: { direction: MoveDirection }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 ${direction === "down" ? "rotate-180" : ""}`}
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

const ARROW_CLASS =
  "flex h-9 w-9 items-center justify-center rounded-md border border-border text-text hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text aria-disabled:opacity-40 aria-disabled:hover:border-border aria-disabled:hover:text-text";

// After a change the refreshed list is the source of truth: focus and the
// success notice are applied only once it shows the expected position, so
// nothing on screen describes an order that hasn't been saved and loaded.
interface PendingFocus {
  id: string;
  index: number;
  target: MoveDirection | "row";
  message: string;
}

// Rules (enforced by the API, mirrored here): the primary is always the
// first photo; marking a photo as primary moves it to the top; arrows only
// reorder the other photos. A move that would take the primary out of first
// place stays focusable (aria-disabled) and explains why instead of acting.
export function AdminVariantImagesEditor({
  productId,
  variantId,
  images,
}: {
  productId: string;
  variantId: string;
  images: AdminImageDto[];
}) {
  const updateImage = useUpdateImageMutation(productId, variantId);
  const deleteImage = useDeleteImageMutation(productId, variantId);
  const reorder = useReorderImagesMutation(productId, variantId);
  const listRef = useRef<HTMLOListElement>(null);
  const ruleId = useId();
  const [notice, setNotice] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null);

  const busy = updateImage.isPending || deleteImage.isPending || reorder.isPending;
  const total = images.length;

  useEffect(() => {
    if (!pendingFocus) return;
    if (images.findIndex((image) => image.id === pendingFocus.id) !== pendingFocus.index) return;
    const item = listRef.current?.querySelector<HTMLElement>(
      `[data-image-id="${pendingFocus.id}"]`,
    );
    if (pendingFocus.target === "row") {
      item?.focus();
    } else {
      const usable = (button: HTMLButtonElement | null | undefined) =>
        button && !button.disabled && button.getAttribute("aria-disabled") !== "true"
          ? button
          : null;
      const other = pendingFocus.target === "up" ? "down" : "up";
      (
        usable(item?.querySelector(`[data-move="${pendingFocus.target}"]`)) ??
        usable(item?.querySelector(`[data-move="${other}"]`)) ??
        item
      )?.focus();
    }
    setNotice(pendingFocus.message);
    setPendingFocus(null);
  }, [images, pendingFocus]);

  function startAction() {
    setNotice(null);
    setHint(null);
    setError(null);
  }

  // Moving the primary down, or a photo above the primary, is not allowed.
  function blockedByPrimary(index: number, direction: MoveDirection): boolean {
    const target = direction === "up" ? index - 1 : index + 1;
    return Boolean(images[index]?.isPrimary || images[target]?.isPrimary);
  }

  function move(index: number, direction: MoveDirection) {
    const target = direction === "up" ? index - 1 : index + 1;
    if (busy || target < 0 || target >= total) return;
    if (blockedByPrimary(index, direction)) {
      startAction();
      setHint(PRIMARY_STAYS_FIRST);
      return;
    }
    startAction();
    const moved = images[index]!;
    const ids = images.map((image) => image.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids, {
      onSuccess: () =>
        setPendingFocus({
          id: moved.id,
          index: target,
          target: direction,
          message: `Orden guardado: «${moved.alt}» quedó en la posición ${target + 1} de ${total}.`,
        }),
      onError: (err) => setError(describeError(err)),
    });
  }

  function markPrimary(image: AdminImageDto) {
    if (busy) return;
    startAction();
    updateImage.mutate(
      { imageId: image.id, body: { isPrimary: true } },
      {
        onSuccess: () =>
          setPendingFocus({
            id: image.id,
            index: 0,
            target: "row",
            message: `«${image.alt}» es ahora la foto principal y pasó al primer lugar.`,
          }),
        onError: (err) => setError(describeError(err)),
      },
    );
  }

  function remove(image: AdminImageDto, index: number) {
    const next = image.isPrimary ? images[index + 1] : undefined;
    if (busy || !window.confirm(deleteConfirmation(image, next))) return;
    startAction();
    deleteImage.mutate(image.id, {
      onSuccess: () =>
        setNotice(
          next
            ? `Foto eliminada. «${next.alt}» es ahora la foto principal y quedó primera.`
            : "Foto eliminada.",
        ),
      onError: (err) => setError(describeError(err)),
    });
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-sm font-medium text-text">Imágenes</p>
      <p id={ruleId} className="mt-1 text-xs text-text-muted">
        La foto principal siempre va primera: es la que se ve en el catálogo y la primera de la
        ficha del producto. Con las flechas ordenás las demás.
      </p>

      {total === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Todavía no hay imágenes para esta variante.</p>
      ) : (
        <ol
          ref={listRef}
          aria-label="Fotos de esta variante, en el orden en que se muestran"
          aria-busy={busy}
          className="mt-3 space-y-2"
        >
          {images.map((image, index) => {
            const deleting = deleteImage.isPending && deleteImage.variables === image.id;
            const arrow = (direction: MoveDirection) => {
              const target = direction === "up" ? index - 1 : index + 1;
              const atEnd = target < 0 || target >= total;
              const locked = !atEnd && blockedByPrimary(index, direction);
              return (
                <button
                  type="button"
                  data-move={direction}
                  onClick={() => move(index, direction)}
                  disabled={busy || atEnd}
                  aria-disabled={locked || undefined}
                  aria-describedby={locked ? ruleId : undefined}
                  aria-label={`${direction === "up" ? "Subir" : "Bajar"} «${image.alt}»`}
                  title={locked ? PRIMARY_STAYS_FIRST : direction === "up" ? "Subir" : "Bajar"}
                  className={ARROW_CLASS}
                >
                  <ArrowIcon direction={direction} />
                </button>
              );
            };
            return (
              <li
                key={image.id}
                data-image-id={image.id}
                tabIndex={-1}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-muted p-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:flex-nowrap"
              >
                <ProductImage
                  publicId={image.cloudinaryPublicId}
                  alt={image.alt}
                  widths={CLOUDINARY_WIDTHS.adminThumbnail}
                  aspectRatio="1 / 1"
                  className="w-16 shrink-0 rounded-md"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-text-muted">
                    Foto {index + 1} de {total}
                  </p>
                  <p className="truncate text-sm text-text" title={image.alt}>
                    {image.alt}
                  </p>
                  {image.isPrimary ? (
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Principal
                      </span>
                      <span className="text-xs text-text-muted">Siempre se muestra primera</span>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => markPrimary(image)}
                      disabled={busy}
                      aria-label={`Marcar «${image.alt}» como foto principal`}
                      className="mt-1 text-xs font-medium text-primary hover:underline disabled:opacity-60"
                    >
                      Marcar como principal
                    </button>
                  )}
                </div>
                <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
                  {arrow("up")}
                  {arrow("down")}
                  <button
                    type="button"
                    onClick={() => remove(image, index)}
                    disabled={busy}
                    aria-label={`Eliminar «${image.alt}»`}
                    className="ml-1 rounded-md px-2 py-2 text-xs font-medium text-danger hover:underline disabled:opacity-60"
                  >
                    {deleting ? "Eliminando…" : "Eliminar"}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div role="status" aria-label="Estado de las fotos" className="mt-2 text-sm">
        {reorder.isPending && <p className="text-text-muted">Guardando el orden…</p>}
        {updateImage.isPending && <p className="text-text-muted">Guardando la foto principal…</p>}
        {hint && !busy && <p className="text-text">{hint}</p>}
        {notice && !busy && <p className="text-success">{notice}</p>}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}

      <AdminImageUploadForm
        productId={productId}
        variantId={variantId}
        isFirstImage={total === 0}
      />
    </div>
  );
}
