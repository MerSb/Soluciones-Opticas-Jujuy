import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type { AdminLensOptionDto, AdminLensTypeDto } from "@soluciones-opticas/shared";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { FormField } from "../../components/forms/FormField";
import { ApiClientError } from "../../services/api-client";
import { formatPrice } from "../../lib/format-price";
import {
  useAdminLensTreatmentsQuery,
  useAdminLensTypeQuery,
  useCreateLensOptionMutation,
  useDeleteLensOptionMutation,
  useDeleteLensTypeMutation,
  useRestoreLensOptionMutation,
  useRestoreLensTypeMutation,
  useUpdateLensOptionMutation,
  useUpdateLensTypeMutation,
} from "../../services/queries/admin-lens";

// One lens type (ADR-0023): its data, included treatments and varieties.

function parseOptionalNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function nullableText(raw: string): string | null {
  return raw.trim() === "" ? null : raw.trim();
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

export function AdminLensTypeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: lensType, isLoading, isError } = useAdminLensTypeQuery(id);

  if (isLoading) return <p className="text-sm text-text-muted">Cargando…</p>;
  if (isError || !lensType) {
    return <StatusMessage variant="error" message="No pudimos cargar este cristal." />;
  }

  return (
    <div className="max-w-4xl">
      <SeoHead title={`${lensType.name} — Administración`} />
      <Link to="/admin/lens-types" className="text-sm text-text-muted hover:text-primary">
        ← Volver a cristales
      </Link>
      <LensTypeForm lensType={lensType} />
      <div className="mt-12">
        <LensOptionsEditor lensType={lensType} />
      </div>
    </div>
  );
}

function LensTypeForm({ lensType }: { lensType: AdminLensTypeDto }) {
  const { data: treatments } = useAdminLensTreatmentsQuery();
  const updateLensType = useUpdateLensTypeMutation();
  const deleteLensType = useDeleteLensTypeMutation();
  const restoreLensType = useRestoreLensTypeMutation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [supportsCustomGraduation, setSupportsCustomGraduation] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [treatmentIds, setTreatmentIds] = useState<string[]>([]);

  useEffect(() => {
    setName(lensType.name);
    setDescription(lensType.description ?? "");
    setBasePrice(lensType.basePrice.toString());
    setSortOrder(lensType.sortOrder.toString());
    setSupportsCustomGraduation(lensType.supportsCustomGraduation);
    setIsFeatured(lensType.isFeatured);
    setTreatmentIds(lensType.treatments.map((treatment) => treatment.id));
  }, [lensType]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    updateLensType.mutate({
      id: lensType.id,
      body: {
        name,
        description: nullableText(description),
        basePrice: Number(basePrice),
        sortOrder: Number(sortOrder),
        supportsCustomGraduation,
        isFeatured,
        treatmentIds,
      },
    });
  }

  // Active treatments, plus any already attached one that was retired
  // since — so saving never silently drops it.
  const attachedIds = new Set(lensType.treatments.map((treatment) => treatment.id));
  const treatmentChoices = (treatments ?? []).filter(
    (treatment) => !treatment.deletedAt || attachedIds.has(treatment.id),
  );

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-text">{lensType.name}</h2>
          <p className="text-sm text-text-muted">Slug: {lensType.slug} (no editable)</p>
        </div>
        {lensType.deletedAt ? (
          <button
            type="button"
            onClick={() => restoreLensType.mutate(lensType.id)}
            disabled={restoreLensType.isPending}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-muted disabled:opacity-60"
          >
            Restaurar cristal
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
            className="rounded-md border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60"
          >
            Eliminar cristal
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <FormField
            label="Precio base (ARS)"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
          />
          <FormField
            label="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <FormField
            label="Orden de aparición"
            type="number"
            inputMode="numeric"
            min="0"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={supportsCustomGraduation}
              onChange={(e) => setSupportsCustomGraduation(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Admite graduación personalizada
              <span className="block text-text-muted">
                El cliente puede pedirla; la óptica lo contacta después para asesorarlo. No agrega
                un costo automático.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Destacado
              <span className="block text-text-muted">
                Se resalta en la ficha del producto. La cantidad de variedades se calcula sola.
              </span>
            </span>
          </label>
        </div>

        <fieldset>
          <legend className="font-display text-base font-semibold text-text">
            Tratamientos incluidos
          </legend>
          {treatmentChoices.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">
              Todavía no hay tratamientos. Crealos en{" "}
              <Link to="/admin/lens-treatments" className="text-primary hover:underline">
                Tratamientos
              </Link>
              .
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              {treatmentChoices.map((treatment) => (
                <label key={treatment.id} className="flex items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={treatmentIds.includes(treatment.id)}
                    onChange={(e) =>
                      setTreatmentIds((current) =>
                        e.target.checked
                          ? [...current, treatment.id]
                          : current.filter((value) => value !== treatment.id),
                      )
                    }
                  />
                  {treatment.name}
                  {treatment.deletedAt && <span className="text-text-muted">(eliminado)</span>}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {updateLensType.isError && (
          <p role="alert" className="text-sm text-danger">
            {errorText(updateLensType.error, "No pudimos guardar los cambios.")}
          </p>
        )}
        {updateLensType.isSuccess && !updateLensType.isPending && (
          <p role="status" className="text-sm text-success">
            Los cambios se guardaron correctamente.
          </p>
        )}

        <button
          type="submit"
          disabled={updateLensType.isPending}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {updateLensType.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}

interface OptionFormState {
  name: string;
  swatchHex: string;
  priceOverride: string;
  stock: string;
  sortOrder: string;
}

const EMPTY_OPTION_FORM: OptionFormState = {
  name: "",
  swatchHex: "",
  priceOverride: "",
  stock: "",
  sortOrder: "0",
};

function toOptionBody(form: OptionFormState) {
  return {
    name: form.name,
    swatchHex: nullableText(form.swatchHex),
    priceOverride: parseOptionalNumber(form.priceOverride),
    stock: parseOptionalNumber(form.stock),
    sortOrder: Number(form.sortOrder) || 0,
  };
}

function OptionFields({
  form,
  onChange,
}: {
  form: OptionFormState;
  onChange: (form: OptionFormState) => void;
}) {
  return (
    <>
      <FormField
        label="Nombre"
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        className="w-48"
      />
      <FormField
        label="Color de muestra (#RRGGBB, opcional)"
        value={form.swatchHex}
        placeholder="#1A2B3C"
        onChange={(e) => onChange({ ...form, swatchHex: e.target.value })}
        className="w-56"
      />
      <FormField
        label="Precio propio (opcional)"
        type="number"
        inputMode="decimal"
        min="0.01"
        step="0.01"
        value={form.priceOverride}
        onChange={(e) => onChange({ ...form, priceOverride: e.target.value })}
        className="w-44"
      />
      <FormField
        label="Stock (vacío = sin control)"
        type="number"
        inputMode="numeric"
        min="0"
        value={form.stock}
        onChange={(e) => onChange({ ...form, stock: e.target.value })}
        className="w-48"
      />
      <FormField
        label="Orden"
        type="number"
        inputMode="numeric"
        min="0"
        value={form.sortOrder}
        onChange={(e) => onChange({ ...form, sortOrder: e.target.value })}
        className="w-24"
      />
    </>
  );
}

function LensOptionsEditor({ lensType }: { lensType: AdminLensTypeDto }) {
  const createOption = useCreateLensOptionMutation(lensType.id);
  const [form, setForm] = useState<OptionFormState>(EMPTY_OPTION_FORM);

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createOption.mutate(toOptionBody(form), { onSuccess: () => setForm(EMPTY_OPTION_FORM) });
  }

  return (
    <section aria-labelledby="lens-options-heading">
      <h3 id="lens-options-heading" className="font-display text-base font-semibold text-text">
        Variedades
      </h3>
      <p className="mt-1 text-sm text-text-muted">
        Opcional. Si el cristal tiene variedades, el cliente debe elegir una. Sin precio propio, una
        variedad usa el precio base ({formatPrice(lensType.basePrice)}). Variedades activas:{" "}
        {lensType.activeOptionCount}.
      </p>

      <form onSubmit={handleCreate} className="mt-3 flex flex-wrap items-end gap-3" noValidate>
        <OptionFields form={form} onChange={setForm} />
        <button
          type="submit"
          disabled={createOption.isPending || form.name.trim() === ""}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {createOption.isPending ? "Agregando…" : "Agregar variedad"}
        </button>
      </form>
      {createOption.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errorText(createOption.error, "No pudimos agregar la variedad.")}
        </p>
      )}

      {lensType.options.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2 pr-4 font-medium">Nombre</th>
                <th className="py-2 pr-4 font-medium">Precio</th>
                <th className="py-2 pr-4 font-medium">Stock</th>
                <th className="py-2 pr-4 font-medium">Orden</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lensType.options.map((option) => (
                <LensOptionRow key={option.id} lensTypeId={lensType.id} option={option} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LensOptionRow({ lensTypeId, option }: { lensTypeId: string; option: AdminLensOptionDto }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OptionFormState>(EMPTY_OPTION_FORM);
  const updateOption = useUpdateLensOptionMutation(lensTypeId);
  const deleteOption = useDeleteLensOptionMutation(lensTypeId);
  const restoreOption = useRestoreLensOptionMutation(lensTypeId);

  function startEditing() {
    setForm({
      name: option.name,
      swatchHex: option.swatchHex ?? "",
      priceOverride: option.priceOverride?.toString() ?? "",
      stock: option.stock?.toString() ?? "",
      sortOrder: option.sortOrder.toString(),
    });
    setEditing(true);
  }

  if (editing) {
    return (
      <tr className="border-b border-border align-top">
        <td className="py-2" colSpan={6}>
          <div className="flex flex-wrap items-end gap-3">
            <OptionFields form={form} onChange={setForm} />
            <button
              type="button"
              onClick={() =>
                updateOption.mutate(
                  { optionId: option.id, body: toOptionBody(form) },
                  { onSuccess: () => setEditing(false) },
                )
              }
              disabled={updateOption.isPending}
              className="rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-surface hover:bg-primary-dark disabled:opacity-60"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-border px-3 py-2.5 text-sm font-medium text-text hover:bg-surface-muted"
            >
              Cancelar
            </button>
          </div>
          {updateOption.isError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {errorText(updateOption.error, "No pudimos guardar la variedad.")}
            </p>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border">
      <td className="py-2 pr-4 text-text">
        <span className="flex items-center gap-2">
          {option.swatchHex && (
            <span
              aria-hidden="true"
              className="h-4 w-4 rounded-full border border-border"
              style={{ backgroundColor: option.swatchHex }}
            />
          )}
          {option.name}
        </span>
      </td>
      <td className="py-2 pr-4 text-text">
        {formatPrice(option.price)}
        {option.priceOverride === null && (
          <span className="block text-xs text-text-muted">Precio base</span>
        )}
      </td>
      <td className="py-2 pr-4 text-text">
        {option.stock === null ? "Sin control" : option.stock}
      </td>
      <td className="py-2 pr-4 text-text">{option.sortOrder}</td>
      <td className="py-2 pr-4">
        {option.deletedAt ? (
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
            onClick={startEditing}
            className="text-sm font-medium text-primary hover:underline"
          >
            Editar
          </button>
          {option.deletedAt ? (
            <button
              type="button"
              onClick={() => restoreOption.mutate(option.id)}
              disabled={restoreOption.isPending}
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
                    `¿Eliminar la variedad "${option.name}"? Vas a poder restaurarla después.`,
                  )
                ) {
                  deleteOption.mutate(option.id);
                }
              }}
              disabled={deleteOption.isPending}
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
