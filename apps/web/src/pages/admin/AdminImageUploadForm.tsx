import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { FormField } from "../../components/forms/FormField";
import { ApiClientError } from "../../services/api-client";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  validateImageFile,
} from "../../lib/image-validation";
import { useUploadProductImageMutation } from "../../services/queries/admin";

const MAX_MB = MAX_IMAGE_BYTES / (1024 * 1024);

export const UPLOAD_SUCCESS_MESSAGE = "Imagen subida correctamente.";
const NETWORK_ERROR_MESSAGE =
  "No pudimos conectarnos para subir la imagen. Revisá tu conexión e intentá de nuevo.";
const GENERIC_UPLOAD_ERROR =
  "No pudimos subir la imagen. Probá de nuevo o elegí otra foto (JPEG, PNG o WebP).";

// The flow is three calls (sign → Cloudinary → register). Only our own
// API's 4xx messages are curated Spanish; Cloudinary's text and any 5xx
// body are never shown as-is.
function describeUploadError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.status < 500 ? error.message : GENERIC_UPLOAD_ERROR;
  }
  if (error instanceof TypeError) return NETWORK_ERROR_MESSAGE;
  return GENERIC_UPLOAD_ERROR;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function ImageIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-9 9" />
    </svg>
  );
}

// One image per upload (the API registers one image per call, each with
// its own alt text). The visible "Seleccionar imagen" control is part of
// the <label> of the real file input, so clicking anywhere in the zone —
// or pressing Enter/Space on the focused input — opens the native picker.
export function AdminImageUploadForm({
  productId,
  variantId,
  isFirstImage,
}: {
  productId: string;
  variantId: string;
  isFirstImage: boolean;
}) {
  const upload = useUploadProductImageMutation(productId, variantId);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [dragging, setDragging] = useState(false);

  const id = useId();
  const inputId = `${id}-file`;
  const titleId = `${id}-title`;
  const actionId = `${id}-action`;
  const helpId = `${id}-help`;

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function clearSelection() {
    setFile(null);
    setPreviewUrl(null);
    // Without this the native input keeps the old file, and picking the
    // same file again would never fire `change`.
    if (inputRef.current) inputRef.current.value = "";
  }

  function selectFile(selected: File | null) {
    upload.reset();
    setSucceeded(false);
    if (!selected) return; // picker cancelled: keep the current selection
    const error = validateImageFile(selected);
    if (error) {
      clearSelection();
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (upload.isPending) return;
    selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  function startUpload() {
    if (!file || submittingRef.current || upload.isPending) return;
    submittingRef.current = true;
    upload.mutate(
      { file, alt: alt.trim(), isPrimary: isFirstImage },
      {
        onSuccess: () => {
          clearSelection();
          setAlt("");
          setSucceeded(true);
        },
        onSettled: () => {
          submittingRef.current = false;
        },
      },
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    startUpload();
  }

  const canSubmit = Boolean(file) && alt.trim() !== "" && !upload.isPending;

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-3"
      noValidate
      aria-busy={upload.isPending}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
        onChange={handleFileChange}
        disabled={upload.isPending}
        aria-labelledby={actionId}
        aria-describedby={`${titleId} ${helpId}`}
        className="peer sr-only"
      />
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!upload.isPending) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors peer-focus-visible:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${
          dragging
            ? "border-primary bg-primary/10"
            : "border-border bg-surface-muted hover:border-primary hover:bg-primary/5"
        }`}
      >
        <span className="text-primary">
          <ImageIcon />
        </span>
        <span id={titleId} className="text-sm font-medium text-text">
          Agregá fotos de este producto
        </span>
        <span
          id={actionId}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-surface"
        >
          {file ? "Cambiar imagen" : "Seleccionar imagen"}
        </span>
        <span id={helpId} className="text-xs text-text-muted">
          JPEG, PNG o WebP · hasta {MAX_MB} MB · una imagen por vez
          <span className="hidden sm:inline"> · también podés arrastrarla acá</span>
        </span>
      </label>

      {validationError && (
        <p role="alert" className="text-sm text-danger">
          {validationError}
        </p>
      )}

      {file && previewUrl && (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 items-center gap-3">
            {/* Local preview only — it does not mean the upload succeeded. */}
            <img
              src={previewUrl}
              alt="Vista previa de la imagen seleccionada"
              className="h-16 w-16 shrink-0 rounded-md border border-border object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-text-muted">{formatSize(file.size)}</p>
              <button
                type="button"
                onClick={() => {
                  upload.reset();
                  clearSelection();
                }}
                disabled={upload.isPending}
                className="text-xs font-medium text-danger hover:underline disabled:opacity-60"
              >
                Quitar
              </button>
            </div>
          </div>
          <FormField
            label="Descripción de la foto"
            hint="Por ejemplo: «Vista frontal, color negro». La usan lectores de pantalla y buscadores."
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
            required
            maxLength={300}
            disabled={upload.isPending}
            className="w-full sm:flex-1"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="shrink-0 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
          >
            {upload.isPending ? "Subiendo…" : "Subir imagen"}
          </button>
        </div>
      )}

      <div role="status">
        {upload.isPending && <p className="text-sm text-text-muted">Subiendo imagen…</p>}
        {succeeded && <p className="text-sm text-success">{UPLOAD_SUCCESS_MESSAGE}</p>}
      </div>

      {upload.isError && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-danger">
            {describeUploadError(upload.error)}
          </p>
          {file && (
            <button
              type="button"
              onClick={startUpload}
              disabled={!canSubmit}
              className="text-sm font-medium text-primary hover:underline disabled:opacity-60"
            >
              Reintentar
            </button>
          )}
        </div>
      )}
    </form>
  );
}
