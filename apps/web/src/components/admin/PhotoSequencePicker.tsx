import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  validateImageFile,
} from "../../lib/image-validation";
import { photoFileKey, toggleInSequence } from "../../lib/photo-sequence";
import { ImageGalleryLightbox, type GalleryPhoto } from "../products/ImageGalleryLightbox";
import { MagnifierIcon } from "../products/ProductImageZoom";

const MAX_MB = MAX_IMAGE_BYTES / (1024 * 1024);

export interface PhotoCandidate {
  key: string;
  file: File;
  url: string;
}

export type PhotoUploadStatus = "uploading" | "saved" | "failed";

/** The photos on screen and the order the admin clicked them in. Previews
 * are object URLs, released when a photo leaves the list or on unmount. */
export function usePhotoSequence() {
  const [candidates, setCandidates] = useState<PhotoCandidate[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;

  useEffect(
    () => () => {
      for (const candidate of candidatesRef.current) URL.revokeObjectURL(candidate.url);
    },
    [],
  );

  function add(files: File[]) {
    const known = new Set(candidatesRef.current.map((c) => c.key));
    const added: PhotoCandidate[] = [];
    let invalid: string | null = null;
    let repeated = 0;
    for (const file of files) {
      const error = validateImageFile(file);
      if (error) {
        invalid ??= `«${file.name}»: ${error}`;
        continue;
      }
      const key = photoFileKey(file);
      if (known.has(key)) {
        repeated += 1;
        continue;
      }
      known.add(key);
      added.push({ key, file, url: URL.createObjectURL(file) });
    }
    const messages = [
      invalid,
      repeated > 0
        ? `${repeated === 1 ? "Una foto ya estaba" : `${repeated} fotos ya estaban`} en la lista: no se repite${repeated === 1 ? "" : "n"}.`
        : null,
    ].filter(Boolean);
    setNotice(messages.length > 0 ? messages.join(" ") : null);
    if (added.length > 0) setCandidates((current) => [...current, ...added]);
  }

  function toggle(key: string) {
    setNotice(null);
    setOrder((current) => toggleInSequence(current, key));
  }

  function unselectAll() {
    setNotice(null);
    setOrder([]);
  }

  /** Takes these photos off the list entirely (e.g. once they are uploaded). */
  function discard(keys: readonly string[]) {
    const gone = new Set(keys);
    for (const candidate of candidatesRef.current) {
      if (gone.has(candidate.key)) URL.revokeObjectURL(candidate.url);
    }
    setCandidates((current) => current.filter((c) => !gone.has(c.key)));
    setOrder((current) => current.filter((k) => !gone.has(k)));
  }

  const byKey = new Map(candidates.map((c) => [c.key, c]));
  const selected = order.map((key) => byKey.get(key)).filter((c): c is PhotoCandidate => !!c);

  return { candidates, order, selected, notice, add, toggle, unselectAll, discard };
}

export type PhotoSequence = ReturnType<typeof usePhotoSequence>;

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      className="h-3.5 w-3.5"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

/** "850 KB", "2,4 MB": how heavy the file on the computer is. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`;
}

const STATUS_TEXT: Record<PhotoUploadStatus, string> = {
  uploading: "Subiendo…",
  saved: "Subida",
  failed: "Falló",
};

/**
 * Thumbnails of every photo brought in; clicking one gives it the next
 * number, clicking it again takes it out and renumbers the rest. Only the
 * numbered photos are uploaded, in that order. Photos in `locked` (already
 * uploaded) can't be unselected.
 *
 * "Ver grande" (its own button on each photo, so looking never changes the
 * numbering) opens the enlarged view of the local preview — nothing is
 * uploaded or copied: it shows the same object URL as the thumbnail.
 */
export function PhotoSequencePicker({
  sequence,
  firstIsPrimary,
  existingCount = 0,
  disabled = false,
  locked,
  statuses,
}: {
  sequence: PhotoSequence;
  /** The variant has no photos yet: number 1 becomes the primary. */
  firstIsPrimary: boolean;
  existingCount?: number;
  disabled?: boolean;
  locked?: ReadonlySet<string>;
  statuses?: Readonly<Record<string, PhotoUploadStatus>>;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  // Which list the enlarged view walks through, and from where.
  const [viewing, setViewing] = useState<{ list: "all" | "order"; index: number } | null>(null);
  const viewTrigger = useRef<HTMLElement | null>(null);
  const { candidates, order, selected, notice } = sequence;
  const position = new Map(order.map((key, index) => [key, index + 1]));

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    sequence.add(Array.from(event.target.files ?? []));
    // Choosing the same files again must fire `change` again.
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) sequence.add(Array.from(event.dataTransfer.files ?? []));
  }

  function openViewer(list: "all" | "order", index: number, trigger: HTMLElement) {
    viewTrigger.current = trigger;
    setViewing({ list, index });
  }

  function describe(candidate: PhotoCandidate): string {
    const number = position.get(candidate.key);
    const place = number
      ? `número ${number} del orden${number === 1 && firstIsPrimary ? " · principal" : ""}`
      : "sin elegir: no se sube";
    return `${formatFileSize(candidate.file.size)} · ${place}`;
  }

  const viewerList = viewing?.list === "order" ? selected : candidates;
  const viewerPhotos: GalleryPhoto[] = viewerList.map((candidate) => ({
    src: candidate.url,
    alt: candidate.file.name,
    caption: describe(candidate),
  }));

  const howTo = firstIsPrimary
    ? "La 1 es la principal: la que se ve en el catálogo."
    : `Se agregan después de ${existingCount === 1 ? "la foto actual" : `las ${existingCount} fotos actuales`}; la principal no cambia.`;

  return (
    <div className="space-y-3">
      <input
        id={`${id}-files`}
        type="file"
        multiple
        accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
        onChange={handleFiles}
        disabled={disabled}
        aria-labelledby={`${id}-action`}
        aria-describedby={`${id}-help`}
        className="peer sr-only"
      />
      <label
        htmlFor={`${id}-files`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors peer-focus-visible:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${
          dragging
            ? "border-primary bg-primary/10"
            : "border-border bg-surface-muted hover:border-primary hover:bg-primary/5"
        }`}
      >
        <span
          id={`${id}-action`}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-surface"
        >
          {candidates.length > 0 ? "Agregar más fotos" : "Elegir fotos"}
        </span>
        <span id={`${id}-help`} className="text-xs text-text-muted">
          Podés elegir todas las de la carpeta juntas · JPEG, PNG o WebP · hasta {MAX_MB} MB cada
          una
          <span className="hidden sm:inline"> · también podés arrastrarlas acá</span>
        </span>
      </label>

      {notice && (
        <p role="alert" className="text-sm text-danger">
          {notice}
        </p>
      )}

      {candidates.length > 0 && (
        <>
          <p id={`${id}-how`} className="text-sm text-text">
            <strong>Tocá las fotos en el orden en que se van a mostrar.</strong> {howTo} Tocá de
            nuevo una foto para sacarla. Con la lupa la ves en grande antes de subirla.
          </p>
          <ul
            aria-label="Fotos para elegir"
            aria-describedby={`${id}-how`}
            className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"
          >
            {candidates.map((candidate, candidateIndex) => {
              const number = position.get(candidate.key);
              const isPrimary = number === 1 && firstIsPrimary;
              const status = statuses?.[candidate.key];
              const isLocked = locked?.has(candidate.key) ?? false;
              const state = number
                ? `elegida, número ${number}${isPrimary ? ", principal" : ""}`
                : "sin elegir";
              return (
                <li key={candidate.key} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isLocked) sequence.toggle(candidate.key);
                    }}
                    disabled={disabled}
                    aria-disabled={isLocked || undefined}
                    aria-pressed={number !== undefined}
                    aria-label={`${candidate.file.name}: ${state}${status ? `, ${STATUS_TEXT[status].toLowerCase()}` : ""}`}
                    title={candidate.file.name}
                    className={`relative block aspect-square w-full overflow-hidden rounded-md border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed ${
                      number
                        ? "border-primary"
                        : "border-border opacity-70 hover:border-primary/60 hover:opacity-100"
                    }`}
                  >
                    <img src={candidate.url} alt="" className="h-full w-full object-cover" />
                    <span
                      aria-hidden="true"
                      className={`absolute left-1 top-1 flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-bold shadow ${
                        number
                          ? "bg-primary text-surface"
                          : "border-2 border-surface bg-black/30 text-transparent"
                      }`}
                    >
                      {number ?? "·"}
                    </span>
                    {isPrimary && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-1 left-1 right-11 rounded bg-primary/90 px-1 py-0.5 text-center text-[11px] font-semibold text-surface"
                      >
                        Principal
                      </span>
                    )}
                    {status && (
                      <span
                        aria-hidden="true"
                        className={`absolute right-1 top-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-semibold ${
                          status === "saved"
                            ? "bg-success text-surface"
                            : status === "failed"
                              ? "bg-danger text-surface"
                              : "bg-surface/90 text-text"
                        }`}
                      >
                        {status === "saved" && <CheckIcon />}
                        {STATUS_TEXT[status]}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => openViewer("all", candidateIndex, event.currentTarget)}
                    aria-haspopup="dialog"
                    aria-label={`Ver grande «${candidate.file.name}»`}
                    title="Ver grande"
                    className="absolute bottom-1 right-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface/95 text-text shadow ring-1 ring-border hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <MagnifierIcon className="h-5 w-5" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-text-muted" aria-live="polite">
              {selected.length} de {candidates.length} elegida{candidates.length === 1 ? "" : "s"}
              {selected.length < candidates.length ? " · las no elegidas no se suben" : ""}
            </span>
            {order.length > 0 && !disabled && !(locked && locked.size > 0) && (
              <button
                type="button"
                onClick={sequence.unselectAll}
                className="font-medium text-primary hover:underline"
              >
                Desmarcar todas
              </button>
            )}
          </div>

          {selected.length > 0 && (
            <div className="rounded-md border border-border bg-surface-muted p-3">
              <p className="text-sm font-semibold text-text">Orden final</p>
              <ol aria-label="Orden final" className="mt-2 flex flex-wrap gap-2">
                {selected.map((candidate, index) => (
                  <li key={candidate.key} className="w-14 text-center text-xs text-text">
                    <button
                      type="button"
                      onClick={(event) => openViewer("order", index, event.currentTarget)}
                      aria-haspopup="dialog"
                      aria-label={`Ver grande la foto ${index + 1} del orden, «${candidate.file.name}»`}
                      title="Ver grande"
                      className="block cursor-zoom-in rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <img
                        src={candidate.url}
                        alt=""
                        className="h-14 w-14 rounded border border-border object-cover"
                      />
                    </button>
                    <span className="mt-0.5 block font-semibold">{index + 1}</span>
                    {index === 0 && firstIsPrimary && (
                      <span className="block text-[11px] text-primary">Principal</span>
                    )}
                    <span className="sr-only">{candidate.file.name}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {viewing && viewerPhotos.length > 0 && (
        <ImageGalleryLightbox
          photos={viewerPhotos}
          startIndex={viewing.index}
          closeOnBackdrop
          onClose={() => {
            setViewing(null);
            viewTrigger.current?.focus();
          }}
        />
      )}
    </div>
  );
}
