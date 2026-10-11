import { useEffect, useRef, useState } from "react";
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
const NETWORK_ERROR = "No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.";

// Our API's 4xx messages are curated Spanish (e.g. the 409 for a stale
// order); 5xx bodies and provider errors are never shown as-is.
function describeError(error: unknown): string {
  if (error instanceof ApiClientError) return error.status < 500 ? error.message : GENERIC_ERROR;
  if (error instanceof TypeError) return NETWORK_ERROR;
  return GENERIC_ERROR;
}

function deleteConfirmation(image: AdminImageDto, total: number): string {
  const intro = `¿Eliminar la foto «${image.alt}»?`;
  const primary =
    image.isPrimary && total > 1
      ? " Es la foto principal: la siguiente foto del orden pasará a ser la principal."
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

// The list always shows the server's order: a move is sent as the full new
// order, the controls are disabled while it is saved, and the list is only
// redrawn from the refreshed data — a rejected order never looks applied.
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
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Focus follows the moved photo once the refreshed list is rendered (the
  // clicked button was disabled while saving, which drops focus).
  // The success notice waits for the same moment, so it never describes an
  // order the screen doesn't show yet.
  const [pendingFocus, setPendingFocus] = useState<{
    id: string;
    index: number;
    direction: MoveDirection;
    message: string;
  } | null>(null);

  const busy = updateImage.isPending || deleteImage.isPending || reorder.isPending;
  const total = images.length;

  useEffect(() => {
    if (!pendingFocus) return;
    if (images.findIndex((image) => image.id === pendingFocus.id) !== pendingFocus.index) return;
    const item = listRef.current?.querySelector<HTMLElement>(
      `[data-image-id="${pendingFocus.id}"]`,
    );
    const preferred = item?.querySelector<HTMLButtonElement>(
      `[data-move="${pendingFocus.direction}"]`,
    );
    const fallback = item?.querySelector<HTMLButtonElement>(
      `[data-move="${pendingFocus.direction === "up" ? "down" : "up"}"]`,
    );
    (preferred && !preferred.disabled ? preferred : fallback)?.focus();
    setNotice(pendingFocus.message);
    setPendingFocus(null);
  }, [images, pendingFocus]);

  function startAction() {
    setNotice(null);
    setError(null);
  }

  function move(index: number, direction: MoveDirection) {
    const target = direction === "up" ? index - 1 : index + 1;
    if (busy || target < 0 || target >= total) return;
    startAction();
    const moved = images[index]!;
    const ids = images.map((image) => image.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids, {
      onSuccess: () =>
        setPendingFocus({
          id: moved.id,
          index: target,
          direction,
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
        onSuccess: () => setNotice(`«${image.alt}» es ahora la foto principal del catálogo.`),
        onError: (err) => setError(describeError(err)),
      },
    );
  }

  function remove(image: AdminImageDto) {
    if (busy || !window.confirm(deleteConfirmation(image, total))) return;
    startAction();
    deleteImage.mutate(image.id, {
      onSuccess: () =>
        setNotice(
          image.isPrimary && total > 1
            ? "Foto eliminada. La siguiente foto pasó a ser la principal."
            : "Foto eliminada.",
        ),
      onError: (err) => setError(describeError(err)),
    });
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-sm font-medium text-text">Imágenes</p>
      <p className="mt-1 text-xs text-text-muted">
        La foto principal es la que se ve en el listado del catálogo. El orden define cómo se
        muestran en la ficha del producto.
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
            return (
              <li
                key={image.id}
                data-image-id={image.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-muted p-2 sm:flex-nowrap"
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
                    <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Principal
                    </span>
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
                  <button
                    type="button"
                    data-move="up"
                    onClick={() => move(index, "up")}
                    disabled={busy || index === 0}
                    aria-label={`Subir «${image.alt}»`}
                    title="Subir"
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text"
                  >
                    <ArrowIcon direction="up" />
                  </button>
                  <button
                    type="button"
                    data-move="down"
                    onClick={() => move(index, "down")}
                    disabled={busy || index === total - 1}
                    aria-label={`Bajar «${image.alt}»`}
                    title="Bajar"
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text"
                  >
                    <ArrowIcon direction="down" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(image)}
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
