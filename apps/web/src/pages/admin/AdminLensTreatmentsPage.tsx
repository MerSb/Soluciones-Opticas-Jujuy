import { useState } from "react";
import type { FormEvent } from "react";
import type { AdminLensTreatmentDto } from "@soluciones-opticas/shared";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { FormField } from "../../components/forms/FormField";
import { ApiClientError } from "../../services/api-client";
import {
  useAdminLensTreatmentsQuery,
  useCreateLensTreatmentMutation,
  useDeleteLensTreatmentMutation,
  useRestoreLensTreatmentMutation,
  useUpdateLensTreatmentMutation,
} from "../../services/queries/admin-lens";

// Lens treatments (ADR-0023) — informative only: what a lens includes,
// never priced or picked separately by the customer.
export function AdminLensTreatmentsPage() {
  const { data: treatments, isLoading, isError } = useAdminLensTreatmentsQuery();
  const createTreatment = useCreateLensTreatmentMutation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createTreatment.mutate(
      { name, description: description.trim() === "" ? null : description },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
        },
      },
    );
  }

  return (
    <div>
      <SeoHead title="Tratamientos — Administración" />
      <h2 className="font-display text-lg font-semibold text-text">Nuevo tratamiento</h2>
      <p className="mt-1 text-sm text-text-muted">
        Se muestran como "Incluye" en cada cristal. No tienen precio propio.
      </p>
      <form onSubmit={handleCreate} className="mt-3 flex flex-wrap items-end gap-3" noValidate>
        <FormField
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-64"
        />
        <FormField
          label="Descripción (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-80"
        />
        <button
          type="submit"
          disabled={createTreatment.isPending || name.trim() === ""}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {createTreatment.isPending ? "Creando…" : "Crear tratamiento"}
        </button>
      </form>
      {createTreatment.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {createTreatment.error instanceof ApiClientError
            ? createTreatment.error.message
            : "No pudimos crear el tratamiento."}
        </p>
      )}

      <h2 className="mt-10 font-display text-lg font-semibold text-text">Tratamientos</h2>
      {isLoading && <p className="mt-3 text-sm text-text-muted">Cargando…</p>}
      {isError && <StatusMessage variant="error" message="No pudimos cargar los tratamientos." />}
      {treatments && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2 pr-4 font-medium">Nombre</th>
                <th className="py-2 pr-4 font-medium">Descripción</th>
                <th className="py-2 pr-4 font-medium">Cristales</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {treatments.map((treatment) => (
                <TreatmentRow key={treatment.id} treatment={treatment} />
              ))}
            </tbody>
          </table>
          {treatments.length === 0 && (
            <p className="mt-4 text-sm text-text-muted">Todavía no hay tratamientos cargados.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TreatmentRow({ treatment }: { treatment: AdminLensTreatmentDto }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(treatment.name);
  const [description, setDescription] = useState(treatment.description ?? "");
  const updateTreatment = useUpdateLensTreatmentMutation();
  const deleteTreatment = useDeleteLensTreatmentMutation();
  const restoreTreatment = useRestoreLensTreatmentMutation();

  if (editing) {
    return (
      <tr className="border-b border-border align-top">
        <td className="py-2 pr-4">
          <FormField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        </td>
        <td className="py-2 pr-4" colSpan={4}>
          <FormField
            label="Descripción"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mb-2"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                updateTreatment.mutate(
                  {
                    id: treatment.id,
                    body: { name, description: description.trim() === "" ? null : description },
                  },
                  { onSuccess: () => setEditing(false) },
                )
              }
              disabled={updateTreatment.isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-surface hover:bg-primary-dark disabled:opacity-60"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-muted"
            >
              Cancelar
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border">
      <td className="py-2 pr-4 text-text">{treatment.name}</td>
      <td className="py-2 pr-4 text-text-muted">{treatment.description ?? "—"}</td>
      <td className="py-2 pr-4 text-text">{treatment.lensTypeCount}</td>
      <td className="py-2 pr-4">
        {treatment.deletedAt ? (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
            Eliminado
          </span>
        ) : (
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
            Activo
          </span>
        )}
      </td>
      <td className="py-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-primary hover:underline"
          >
            Editar
          </button>
          {treatment.deletedAt ? (
            <button
              type="button"
              onClick={() => restoreTreatment.mutate(treatment.id)}
              disabled={restoreTreatment.isPending}
              className="text-sm font-medium text-primary hover:underline disabled:opacity-60"
            >
              Restaurar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `¿Eliminar el tratamiento "${treatment.name}"? Deja de mostrarse en los cristales; vas a poder restaurarlo después.`,
                  )
                ) {
                  deleteTreatment.mutate(treatment.id);
                }
              }}
              disabled={deleteTreatment.isPending}
              className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
            >
              Eliminar
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
