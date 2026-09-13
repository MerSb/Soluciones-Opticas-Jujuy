import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import type { AdminLensTypeDto } from "@soluciones-opticas/shared";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { FormField } from "../../components/forms/FormField";
import { ApiClientError } from "../../services/api-client";
import { formatPrice } from "../../lib/format-price";
import {
  useAdminLensTypesQuery,
  useCreateLensTypeMutation,
  useDeleteLensTypeMutation,
  useRestoreLensTypeMutation,
} from "../../services/queries/admin-lens";

// Lens types (ADR-0023) — "Cristales" in the admin. Names, prices and
// varieties are the shop's real data, entered here; nothing is preloaded.
export function AdminLensTypesPage() {
  const { data: lensTypes, isLoading, isError } = useAdminLensTypesQuery();
  const createLensType = useCreateLensTypeMutation();

  const [name, setName] = useState("");
  const [basePrice, setBasePrice] = useState("");

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createLensType.mutate(
      { name, basePrice: Number(basePrice) },
      {
        onSuccess: () => {
          setName("");
          setBasePrice("");
        },
      },
    );
  }

  return (
    <div>
      <SeoHead title="Cristales — Administración" />
      <h2 className="font-display text-lg font-semibold text-text">Nuevo tipo de cristal</h2>
      <p className="mt-1 text-sm text-text-muted">
        Después de crearlo podés cargar sus variedades, tratamientos incluidos y si admite
        graduación personalizada.
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
          label="Precio base (ARS)"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          value={basePrice}
          onChange={(e) => setBasePrice(e.target.value)}
          required
          className="w-48"
        />
        <button
          type="submit"
          disabled={createLensType.isPending || name.trim() === "" || basePrice.trim() === ""}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {createLensType.isPending ? "Creando…" : "Crear cristal"}
        </button>
      </form>
      {createLensType.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {createLensType.error instanceof ApiClientError
            ? createLensType.error.message
            : "No pudimos crear el cristal."}
        </p>
      )}

      <h2 className="mt-10 font-display text-lg font-semibold text-text">Tipos de cristal</h2>
      {isLoading && <p className="mt-3 text-sm text-text-muted">Cargando…</p>}
      {isError && <StatusMessage variant="error" message="No pudimos cargar los cristales." />}
      {lensTypes && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2 pr-4 font-medium">Nombre</th>
                <th className="py-2 pr-4 font-medium">Precio base</th>
                <th className="py-2 pr-4 font-medium">Variedades</th>
                <th className="py-2 pr-4 font-medium">Productos</th>
                <th className="py-2 pr-4 font-medium">Graduación</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lensTypes.map((lensType) => (
                <LensTypeRow key={lensType.id} lensType={lensType} />
              ))}
            </tbody>
          </table>
          {lensTypes.length === 0 && (
            <p className="mt-4 text-sm text-text-muted">Todavía no hay cristales cargados.</p>
          )}
        </div>
      )}
    </div>
  );
}

function LensTypeRow({ lensType }: { lensType: AdminLensTypeDto }) {
  const deleteLensType = useDeleteLensTypeMutation();
  const restoreLensType = useRestoreLensTypeMutation();

  return (
    <tr className="border-b border-border">
      <td className="py-2 pr-4">
        <Link
          to={`/admin/lens-types/${lensType.id}`}
          className="font-medium text-primary hover:underline"
        >
          {lensType.name}
        </Link>
        {lensType.isFeatured && (
          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Destacado
          </span>
        )}
      </td>
      <td className="py-2 pr-4 text-text">{formatPrice(lensType.basePrice)}</td>
      <td className="py-2 pr-4 text-text">{lensType.activeOptionCount}</td>
      <td className="py-2 pr-4 text-text">{lensType.productCount}</td>
      <td className="py-2 pr-4 text-text">
        {lensType.supportsCustomGraduation ? "Personalizada" : "No"}
      </td>
      <td className="py-2 pr-4">
        {lensType.deletedAt ? (
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
          <Link
            to={`/admin/lens-types/${lensType.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Editar
          </Link>
          {lensType.deletedAt ? (
            <button
              type="button"
              onClick={() => restoreLensType.mutate(lensType.id)}
              disabled={restoreLensType.isPending}
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
                    `¿Eliminar el cristal "${lensType.name}"? Deja de ofrecerse en los productos; vas a poder restaurarlo después.`,
                  )
                ) {
                  deleteLensType.mutate(lensType.id);
                }
              }}
              disabled={deleteLensType.isPending}
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
