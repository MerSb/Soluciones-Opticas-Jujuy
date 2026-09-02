import { useState } from "react";
import type { FormEvent } from "react";
import type { AdminBrandDto } from "@soluciones-opticas/shared";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { FormField } from "../../components/forms/FormField";
import { ApiClientError } from "../../services/api-client";
import {
  useAdminBrandsQuery,
  useCreateBrandMutation,
  useDeleteBrandMutation,
  useRestoreBrandMutation,
  useUpdateBrandMutation,
} from "../../services/queries/admin";

export function AdminBrandsPage() {
  const { data: brands, isLoading, isError } = useAdminBrandsQuery();
  const createBrand = useCreateBrandMutation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createBrand.mutate(
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
      <SeoHead title="Marcas — Administración" />
      <h2 className="font-display text-lg font-semibold text-text">Nueva marca</h2>
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
          disabled={createBrand.isPending || name.trim() === ""}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {createBrand.isPending ? "Creando…" : "Crear marca"}
        </button>
      </form>
      {createBrand.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {createBrand.error instanceof ApiClientError
            ? createBrand.error.message
            : "No pudimos crear la marca."}
        </p>
      )}

      <h2 className="mt-10 font-display text-lg font-semibold text-text">Marcas</h2>
      {isLoading && <p className="mt-3 text-sm text-text-muted">Cargando…</p>}
      {isError && <StatusMessage variant="error" message="No pudimos cargar las marcas." />}
      {brands && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2 pr-4 font-medium">Nombre</th>
                <th className="py-2 pr-4 font-medium">Slug</th>
                <th className="py-2 pr-4 font-medium">Productos</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => (
                <BrandRow key={brand.id} brand={brand} />
              ))}
            </tbody>
          </table>
          {brands.length === 0 && (
            <p className="mt-4 text-sm text-text-muted">Todavía no hay marcas cargadas.</p>
          )}
        </div>
      )}
    </div>
  );
}

function BrandRow({ brand }: { brand: AdminBrandDto }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(brand.name);
  const [description, setDescription] = useState(brand.description ?? "");
  const updateBrand = useUpdateBrandMutation();
  const deleteBrand = useDeleteBrandMutation();
  const restoreBrand = useRestoreBrandMutation();

  function handleSave() {
    updateBrand.mutate(
      { id: brand.id, body: { name, description: description.trim() === "" ? null : description } },
      { onSuccess: () => setEditing(false) },
    );
  }

  const deleteError =
    deleteBrand.error instanceof ApiClientError ? deleteBrand.error.message : undefined;

  if (editing) {
    return (
      <tr className="border-b border-border align-top">
        <td className="py-2 pr-4">
          <FormField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        </td>
        <td className="py-2 pr-4 text-text-muted">{brand.slug}</td>
        <td className="py-2 pr-4">{brand.productCount}</td>
        <td className="py-2 pr-4" colSpan={2}>
          <FormField
            label="Descripción"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mb-2"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={updateBrand.isPending}
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
      <td className="py-2 pr-4 text-text">{brand.name}</td>
      <td className="py-2 pr-4 text-text-muted">{brand.slug}</td>
      <td className="py-2 pr-4 text-text">{brand.productCount}</td>
      <td className="py-2 pr-4">
        {brand.deletedAt ? (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
            Eliminada
          </span>
        ) : (
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
            Activa
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
          {brand.deletedAt ? (
            <button
              type="button"
              onClick={() => restoreBrand.mutate(brand.id)}
              disabled={restoreBrand.isPending}
              className="text-sm font-medium text-primary hover:underline disabled:opacity-60"
            >
              Restaurar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => deleteBrand.mutate(brand.id)}
              disabled={deleteBrand.isPending}
              className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
            >
              Eliminar
            </button>
          )}
        </div>
        {deleteError && <p className="mt-1 text-xs text-danger">{deleteError}</p>}
      </td>
    </tr>
  );
}
