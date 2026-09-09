import { useState } from "react";
import type { FormEvent } from "react";
import type { AdminCategoryDto } from "@soluciones-opticas/shared";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { FormField } from "../../components/forms/FormField";
import { ApiClientError } from "../../services/api-client";
import {
  useAdminCategoriesQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useRestoreCategoryMutation,
  useUpdateCategoryMutation,
} from "../../services/queries/admin";

export function AdminCategoriesPage() {
  const { data: categories, isLoading, isError } = useAdminCategoriesQuery();
  const createCategory = useCreateCategoryMutation();
  const [name, setName] = useState("");

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createCategory.mutate({ name }, { onSuccess: () => setName("") });
  }

  return (
    <div>
      <SeoHead title="Categorías — Administración" />
      <h2 className="font-display text-lg font-semibold text-text">Nueva categoría</h2>
      <form onSubmit={handleCreate} className="mt-3 flex flex-wrap items-end gap-3" noValidate>
        <FormField
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-64"
        />
        <button
          type="submit"
          disabled={createCategory.isPending || name.trim() === ""}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {createCategory.isPending ? "Creando…" : "Crear categoría"}
        </button>
      </form>
      {createCategory.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {createCategory.error instanceof ApiClientError
            ? createCategory.error.message
            : "No pudimos crear la categoría."}
        </p>
      )}

      <h2 className="mt-10 font-display text-lg font-semibold text-text">Categorías</h2>
      {isLoading && <p className="mt-3 text-sm text-text-muted">Cargando…</p>}
      {isError && <StatusMessage variant="error" message="No pudimos cargar las categorías." />}
      {categories && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
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
              {categories.map((category) => (
                <CategoryRow key={category.id} category={category} />
              ))}
            </tbody>
          </table>
          {categories.length === 0 && (
            <p className="mt-4 text-sm text-text-muted">Todavía no hay categorías cargadas.</p>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryRow({ category }: { category: AdminCategoryDto }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const updateCategory = useUpdateCategoryMutation();
  const deleteCategory = useDeleteCategoryMutation();
  const restoreCategory = useRestoreCategoryMutation();

  const deleteError =
    deleteCategory.error instanceof ApiClientError ? deleteCategory.error.message : undefined;

  if (editing) {
    return (
      <tr className="border-b border-border align-top">
        <td className="py-2 pr-4">
          <FormField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        </td>
        <td className="py-2 pr-4 text-text-muted">{category.slug}</td>
        <td className="py-2 pr-4">{category.productCount}</td>
        <td className="py-2" colSpan={2}>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() =>
                updateCategory.mutate(
                  { id: category.id, body: { name } },
                  { onSuccess: () => setEditing(false) },
                )
              }
              disabled={updateCategory.isPending}
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
      <td className="py-2 pr-4 text-text">{category.name}</td>
      <td className="py-2 pr-4 text-text-muted">{category.slug}</td>
      <td className="py-2 pr-4 text-text">{category.productCount}</td>
      <td className="py-2 pr-4">
        {category.deletedAt ? (
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
          {category.deletedAt ? (
            <button
              type="button"
              onClick={() => restoreCategory.mutate(category.id)}
              disabled={restoreCategory.isPending}
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
                    `¿Eliminar la categoría "${category.name}"? Vas a poder restaurarla después.`,
                  )
                ) {
                  deleteCategory.mutate(category.id);
                }
              }}
              disabled={deleteCategory.isPending}
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
