import { useState } from "react";
import type { FormEvent } from "react";
import type {
  AdminShippingPackageProfileDto,
  AdminShippingSimulationResult,
  ArgentineProvinceCode,
  ShippingMissingConfiguration,
} from "@soluciones-opticas/shared";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { FormField } from "../../components/forms/FormField";
import { ApiClientError } from "../../services/api-client";
import { formatPrice } from "../../lib/format-price";
import { ARGENTINE_PROVINCES, provinceName } from "../../lib/argentina-provinces";
import {
  useAdminShippingProfilesQuery,
  useCreateShippingProfileMutation,
  useDeleteShippingProfileMutation,
  useRestoreShippingProfileMutation,
  useSetDefaultShippingProfileMutation,
  useShippingSimulationMutation,
  useUpdateShippingProfileMutation,
} from "../../services/queries/admin-shipping";

// Shipping V1 — Phase A (ADR-0024): package profiles + cost simulator.
// "Free shipping for the customer" and "what the carrier charges" are
// always shown as two different things; an unknown carrier cost is shown
// as "No disponible", never as $0.

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

interface MeasuresForm {
  name: string;
  weightGrams: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
}

const EMPTY_MEASURES: MeasuresForm = {
  name: "",
  weightGrams: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
};

function toMeasuresBody(form: MeasuresForm) {
  return {
    name: form.name,
    weightGrams: Number(form.weightGrams),
    lengthCm: Number(form.lengthCm),
    widthCm: Number(form.widthCm),
    heightCm: Number(form.heightCm),
  };
}

function MeasuresFields({
  form,
  onChange,
}: {
  form: MeasuresForm;
  onChange: (form: MeasuresForm) => void;
}) {
  const numberField = (label: string, key: keyof Omit<MeasuresForm, "name">) => (
    <FormField
      label={label}
      type="number"
      inputMode="numeric"
      min="1"
      step="1"
      value={form[key]}
      onChange={(e) => onChange({ ...form, [key]: e.target.value })}
      className="w-32"
    />
  );
  return (
    <>
      <FormField
        label="Nombre"
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        className="w-56"
      />
      {numberField("Peso (g)", "weightGrams")}
      {numberField("Largo (cm)", "lengthCm")}
      {numberField("Ancho (cm)", "widthCm")}
      {numberField("Alto (cm)", "heightCm")}
    </>
  );
}

export function AdminShippingPage() {
  return (
    <div>
      <SeoHead title="Envíos — Administración" />
      <p className="max-w-3xl text-sm text-text-muted">
        Política vigente: <strong className="text-text">envío gratis a todo el país</strong>{" "}
        (FREE_NATIONAL_V1). Que el envío sea gratis para el cliente no significa que el transporte
        cueste $0: el costo real del transportista se registra por separado y lo absorbe la óptica.
      </p>
      <div className="mt-8">
        <PackageProfilesSection />
      </div>
      <div className="mt-12">
        <SimulatorSection />
      </div>
    </div>
  );
}

function PackageProfilesSection() {
  const { data: profiles, isLoading, isError } = useAdminShippingProfilesQuery();
  const createProfile = useCreateShippingProfileMutation();
  const [form, setForm] = useState<MeasuresForm>(EMPTY_MEASURES);
  const [isDefault, setIsDefault] = useState(false);

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createProfile.mutate(
      { ...toMeasuresBody(form), isDefault },
      {
        onSuccess: () => {
          setForm(EMPTY_MEASURES);
          setIsDefault(false);
        },
      },
    );
  }

  return (
    <section aria-labelledby="package-profiles-heading">
      <h2 id="package-profiles-heading" className="font-display text-lg font-semibold text-text">
        Perfiles de paquete
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Medidas y peso del paquete con el que se cotiza cada envío. Solo uno puede ser el
        predeterminado; sin un predeterminado no se puede cotizar.
      </p>

      <form onSubmit={handleCreate} className="mt-3 flex flex-wrap items-end gap-3" noValidate>
        <MeasuresFields form={form} onChange={setForm} />
        <label className="flex items-center gap-2 pb-3 text-sm text-text">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Usar como predeterminado
        </label>
        <button
          type="submit"
          disabled={createProfile.isPending || form.name.trim() === ""}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {createProfile.isPending ? "Creando…" : "Crear perfil"}
        </button>
      </form>
      {createProfile.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errorText(createProfile.error, "No pudimos crear el perfil.")}
        </p>
      )}

      {isLoading && <p className="mt-3 text-sm text-text-muted">Cargando…</p>}
      {isError && <StatusMessage variant="error" message="No pudimos cargar los perfiles." />}
      {profiles && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2 pr-4 font-medium">Nombre</th>
                <th className="py-2 pr-4 font-medium">Peso</th>
                <th className="py-2 pr-4 font-medium">Medidas (L × A × H)</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <ProfileRow key={profile.id} profile={profile} />
              ))}
            </tbody>
          </table>
          {profiles.length === 0 && (
            <p className="mt-4 text-sm text-text-muted">
              Todavía no hay perfiles. Cargá las medidas reales del paquete de anteojos.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ProfileRow({ profile }: { profile: AdminShippingPackageProfileDto }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<MeasuresForm>(EMPTY_MEASURES);
  const updateProfile = useUpdateShippingProfileMutation();
  const deleteProfile = useDeleteShippingProfileMutation();
  const restoreProfile = useRestoreShippingProfileMutation();
  const setDefault = useSetDefaultShippingProfileMutation();

  function startEditing() {
    setForm({
      name: profile.name,
      weightGrams: profile.weightGrams.toString(),
      lengthCm: profile.lengthCm.toString(),
      widthCm: profile.widthCm.toString(),
      heightCm: profile.heightCm.toString(),
    });
    setEditing(true);
  }

  if (editing) {
    return (
      <tr className="border-b border-border align-top">
        <td className="py-2" colSpan={5}>
          <div className="flex flex-wrap items-end gap-3">
            <MeasuresFields form={form} onChange={setForm} />
            <button
              type="button"
              onClick={() =>
                updateProfile.mutate(
                  { id: profile.id, body: toMeasuresBody(form) },
                  { onSuccess: () => setEditing(false) },
                )
              }
              disabled={updateProfile.isPending}
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
          {updateProfile.isError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {errorText(updateProfile.error, "No pudimos guardar el perfil.")}
            </p>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border">
      <td className="py-2 pr-4 text-text">
        {profile.name}
        {profile.isDefault && (
          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Predeterminado
          </span>
        )}
      </td>
      <td className="py-2 pr-4 text-text">{profile.weightGrams} g</td>
      <td className="py-2 pr-4 text-text">
        {profile.lengthCm} × {profile.widthCm} × {profile.heightCm} cm
      </td>
      <td className="py-2 pr-4">
        {profile.deletedAt ? (
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
            onClick={startEditing}
            className="text-sm font-medium text-primary hover:underline"
          >
            Editar
          </button>
          {!profile.deletedAt && !profile.isDefault && (
            <button
              type="button"
              onClick={() => setDefault.mutate(profile.id)}
              disabled={setDefault.isPending}
              className="text-sm font-medium text-primary hover:underline disabled:opacity-60"
            >
              Marcar como predeterminado
            </button>
          )}
          {profile.deletedAt ? (
            <button
              type="button"
              onClick={() => restoreProfile.mutate(profile.id)}
              disabled={restoreProfile.isPending}
              className="text-sm font-medium text-primary hover:underline disabled:opacity-60"
            >
              Restaurar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const warning = profile.isDefault
                  ? " Es el predeterminado: hasta elegir otro no se podrá cotizar."
                  : "";
                if (window.confirm(`¿Eliminar el perfil "${profile.name}"?${warning}`)) {
                  deleteProfile.mutate(profile.id);
                }
              }}
              disabled={deleteProfile.isPending}
              className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
            >
              Eliminar
            </button>
          )}
        </div>
        {setDefault.isError && (
          <p className="mt-1 text-xs text-danger">
            {errorText(setDefault.error, "No pudimos marcarlo como predeterminado.")}
          </p>
        )}
      </td>
    </tr>
  );
}

const MISSING_CONFIGURATION_TEXT: Record<ShippingMissingConfiguration, string> = {
  PROVIDER: "Proveedor logístico no configurado.",
  ORIGIN_POSTAL_CODE: "Falta el código postal de la sucursal de origen.",
  PACKAGE_PROFILE: "No hay un perfil de paquete predeterminado.",
};

function SimulatorSection() {
  const simulation = useShippingSimulationMutation();
  const [postalCode, setPostalCode] = useState("");
  const [provinceCode, setProvinceCode] = useState<ArgentineProvinceCode>("Y");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    simulation.mutate({ destinationPostalCode: postalCode, destinationProvinceCode: provinceCode });
  }

  return (
    <section aria-labelledby="shipping-simulator-heading">
      <h2 id="shipping-simulator-heading" className="font-display text-lg font-semibold text-text">
        Simulador de costos de envío
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Cotiza desde la sucursal de origen con el perfil predeterminado. Solo para uso interno.
      </p>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-3" noValidate>
        <FormField
          label="Código postal de destino"
          value={postalCode}
          placeholder="4600 o Y4600ABC"
          onChange={(e) => setPostalCode(e.target.value)}
          className="w-56"
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text" htmlFor="province-select">
            Provincia de destino
          </label>
          <select
            id="province-select"
            value={provinceCode}
            onChange={(e) => setProvinceCode(e.target.value as ArgentineProvinceCode)}
            className="w-64 rounded-md border border-border bg-surface-muted px-4 py-2.5 text-text"
          >
            {ARGENTINE_PROVINCES.map((province) => (
              <option key={province.code} value={province.code}>
                {province.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={simulation.isPending || postalCode.trim() === ""}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {simulation.isPending ? "Simulando…" : "Simular"}
        </button>
      </form>

      {simulation.isError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {errorText(simulation.error, "No pudimos simular el envío.")}
        </p>
      )}
      {simulation.data && <SimulationResult result={simulation.data} />}
    </section>
  );
}

function SimulationResult({ result }: { result: AdminShippingSimulationResult }) {
  const unavailable = "No disponible";
  return (
    <div
      aria-label="Resultado de la simulación"
      className="mt-4 max-w-2xl rounded-md border border-border p-4 text-sm"
    >
      <dl className="space-y-2">
        <div className="flex justify-between gap-4">
          <dt className="text-text-muted">Envío al cliente</dt>
          <dd className="font-semibold text-success">
            {result.customerShippingPrice === 0
              ? "Gratis"
              : formatPrice(result.customerShippingPrice)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-muted">Costo del transportista</dt>
          <dd className="text-text">
            {result.providerShippingCost === null
              ? unavailable
              : formatPrice(result.providerShippingCost)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-muted">Costo absorbido por la óptica</dt>
          <dd className="text-text">
            {result.absorbedShippingCost === null
              ? unavailable
              : formatPrice(result.absorbedShippingCost)}
          </dd>
        </div>
      </dl>

      {result.status === "NOT_CONFIGURED" && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-text">
          {result.missingConfiguration.map((item) => (
            <li key={item}>{MISSING_CONFIGURATION_TEXT[item]}</li>
          ))}
        </ul>
      )}
      {result.status === "FAILED" && (
        <p className="mt-4 text-danger">
          El proveedor no pudo cotizar{result.errorCode ? ` (${result.errorCode})` : ""}. No se
          registra ningún costo estimado.
        </p>
      )}
      {result.status === "NOT_COVERED" && (
        <p className="mt-4 text-danger">El proveedor no cubre este destino.</p>
      )}

      <p className="mt-4 text-xs text-text-muted">
        Origen: {result.origin?.branchName ?? "sin sucursal"}
        {result.origin?.postalCode ? ` (CP ${result.origin.postalCode})` : ""} · Destino: CP{" "}
        {result.destination.postalCode}, {provinceName(result.destination.provinceCode)}
        {result.package
          ? ` · Paquete: ${result.package.profileName} (${result.package.weightGrams} g)`
          : ""}
        {" · Política: "}
        {result.policyCode}
      </p>
    </div>
  );
}
