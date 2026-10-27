import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "../../services/api-client";
import {
  invalidateProduct,
  restorePhotoSequence,
  uploadPhotosInSequence,
} from "../../services/queries/admin";
import type { SequencePhotoResult } from "../../services/queries/admin";
import { PhotoSequencePicker, usePhotoSequence } from "../../components/admin/PhotoSequencePicker";
import type { PhotoUploadStatus } from "../../components/admin/PhotoSequencePicker";

const NETWORK_ERROR = "sin conexión";
const GENERIC_ERROR = "no se pudo subir";

// Our API's 4xx messages are curated Spanish; Cloudinary's text and any
// 5xx body are never shown as-is.
function describeFailure(error: unknown): string {
  if (error instanceof ApiClientError && error.status < 500) return error.message;
  if (error instanceof TypeError) return NETWORK_ERROR;
  return GENERIC_ERROR;
}

interface PlannedPhoto {
  key: string;
  file: File;
  alt: string;
  isPrimary: boolean;
}

/**
 * Adds photos to a variant in the order the admin clicks them
 * (PhotoSequencePicker). The sequence is fixed when "Subir" is pressed:
 * a failure leaves the rest uploaded in order and offers a retry that puts
 * the retried photo back in its number. Never touches the existing photos
 * except to keep them where they are, and never changes the primary of a
 * variant that already has one.
 */
export function AdminPhotoSequenceUpload({
  productId,
  variantId,
  existingCount,
  altBase,
}: {
  productId: string;
  variantId: string;
  existingCount: number;
  /** "Product — Color": each photo's description is this plus "foto N". */
  altBase: string;
}) {
  const queryClient = useQueryClient();
  const sequence = usePhotoSequence();
  const [plan, setPlan] = useState<PlannedPhoto[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, PhotoUploadStatus>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  // How many photos the variant had when the sequence was fixed: the
  // live count grows while the new ones are saved.
  const [baseCount, setBaseCount] = useState(existingCount);
  const [running, setRunning] = useState(false);
  // Double-click guard: state updates are not synchronous.
  const runningRef = useRef(false);
  const savedIds = useRef(new Map<string, string>());

  const firstIsPrimary = plan ? plan[0]?.isPrimary === true : existingCount === 0;
  const failed = plan?.filter((photo) => statuses[photo.key] === "failed") ?? [];

  // The batch is over: the grid starts empty again, unchosen photos too.
  function finish() {
    sequence.discard(sequence.candidates.map((candidate) => candidate.key));
    setPlan(null);
    setStatuses({});
    setFailures({});
    savedIds.current = new Map();
  }

  async function upload() {
    if (runningRef.current) return;
    const isRetry = plan !== null;
    const current: PlannedPhoto[] =
      plan ??
      sequence.selected.map((candidate, index) => ({
        key: candidate.key,
        file: candidate.file,
        alt: `${altBase} — foto ${existingCount + index + 1}`,
        isPrimary: existingCount === 0 && index === 0,
      }));
    const pending = current.filter((photo) => !savedIds.current.has(photo.key));
    if (pending.length === 0) return;
    runningRef.current = true;
    setRunning(true);
    if (!isRetry) setBaseCount(existingCount);
    setPlan(current);
    setSuccess(null);
    setOrderError(null);
    setFailures({});
    setStatuses((now) => ({
      ...now,
      ...Object.fromEntries(pending.map((photo) => [photo.key, "uploading" as const])),
    }));

    const onSettled = (index: number, result: SequencePhotoResult) => {
      const key = pending[index]!.key;
      if (result.ok) savedIds.current.set(key, result.image.id);
      setStatuses((now) => ({ ...now, [key]: result.ok ? "saved" : "failed" }));
      if (!result.ok) setFailures((now) => ({ ...now, [key]: describeFailure(result.error) }));
    };

    try {
      await uploadPhotosInSequence(productId, variantId, pending, onSettled);
      if (isRetry) {
        const inSequence = current
          .map((photo) => savedIds.current.get(photo.key))
          .filter((id): id is string => id !== undefined);
        await restorePhotoSequence(productId, variantId, inSequence).catch(() =>
          setOrderError(
            "Las fotos se subieron, pero no pudimos acomodar el orden. Revisalo con las flechas.",
          ),
        );
      }
      if (current.every((photo) => savedIds.current.has(photo.key))) {
        setSuccess(
          current.length === 1
            ? "Se subió 1 foto."
            : `Se subieron ${current.length} fotos en el orden elegido.`,
        );
        finish();
      }
    } finally {
      invalidateProduct(queryClient, productId);
      runningRef.current = false;
      setRunning(false);
    }
  }

  function dropFailed() {
    const saved = plan?.filter((photo) => savedIds.current.has(photo.key)) ?? [];
    setSuccess(
      saved.length > 0
        ? `Quedaron ${saved.length} foto${saved.length === 1 ? "" : "s"} en el orden elegido.`
        : null,
    );
    finish();
  }

  const count = sequence.selected.length;

  return (
    <div className="mt-4 space-y-3" aria-busy={running}>
      <p className="text-sm font-medium text-text">Agregá fotos de este producto</p>
      <PhotoSequencePicker
        sequence={sequence}
        firstIsPrimary={firstIsPrimary}
        existingCount={plan ? baseCount : existingCount}
        disabled={running || plan !== null}
        statuses={statuses}
      />

      {plan === null && count > 0 && (
        <button
          type="button"
          onClick={upload}
          disabled={running}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {count === 1 ? "Subir 1 foto" : `Subir ${count} fotos en este orden`}
        </button>
      )}

      <div role="status" aria-label="Estado de la carga" className="text-sm">
        {running && (
          <p className="text-text-muted">
            Subiendo {Object.values(statuses).filter((s) => s === "saved").length} de{" "}
            {plan?.length ?? count}…
          </p>
        )}
        {success && !running && <p className="text-success">{success}</p>}
      </div>

      {!running && plan && failed.length > 0 && (
        <div role="alert" className="space-y-2 rounded-md border border-danger/40 p-3 text-sm">
          <p className="text-danger">
            {failed.length === 1
              ? "No se pudo subir una foto"
              : `No se pudieron subir ${failed.length} fotos`}{" "}
            (las demás quedaron guardadas en orden):
          </p>
          <ul className="list-disc pl-5 text-text">
            {failed.map((photo) => (
              <li key={photo.key}>
                Foto {plan.indexOf(photo) + 1} · {photo.file.name}: {failures[photo.key]}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={upload}
              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-surface hover:bg-primary-dark"
            >
              Reintentar {failed.length === 1 ? "la que falló" : "las que fallaron"}
            </button>
            <button
              type="button"
              onClick={dropFailed}
              className="text-sm font-medium text-danger hover:underline"
            >
              No subirlas
            </button>
          </div>
        </div>
      )}
      {!running && orderError && (
        <p role="alert" className="text-sm text-danger">
          {orderError}
        </p>
      )}
    </div>
  );
}
