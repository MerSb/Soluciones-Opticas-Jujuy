import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type {
  ColorFamily,
  FrameMaterial,
  FrameShape,
  OpticalProfileDto,
  StylePreference,
} from "@soluciones-opticas/shared";
import { SeoHead } from "../../components/ui/SeoHead";
import { FormField } from "../../components/forms/FormField";
import { FrameMarkingDiagram } from "../../components/optical-profile/FrameMarkingDiagram";
import { PreferenceChipGroup } from "../../components/optical-profile/PreferenceChipGroup";
import {
  COLOR_FAMILY_OPTIONS,
  FRAME_MATERIAL_OPTIONS,
  FRAME_SHAPE_OPTIONS,
  STYLE_PREFERENCE_OPTIONS,
} from "../../lib/optical-profile-taxonomy";
import {
  useOpticalProfileQuery,
  useUpdateOpticalProfileMutation,
} from "../../services/queries/optical-profile";
import { ApiClientError } from "../../services/api-client";

interface MeasurementsState {
  currentFrameLensWidth: string;
  currentFrameBridgeWidth: string;
  currentFrameTempleLength: string;
  currentFrameLensHeight: string;
}

interface PreferencesState {
  preferredShapes: FrameShape[];
  preferredMaterials: FrameMaterial[];
  preferredColors: ColorFamily[];
  preferredStyles: StylePreference[];
}

function toMeasurementsState(profile: OpticalProfileDto): MeasurementsState {
  return {
    currentFrameLensWidth: profile.currentFrameLensWidth?.toString() ?? "",
    currentFrameBridgeWidth: profile.currentFrameBridgeWidth?.toString() ?? "",
    currentFrameTempleLength: profile.currentFrameTempleLength?.toString() ?? "",
    currentFrameLensHeight: profile.currentFrameLensHeight?.toString() ?? "",
  };
}

function toPreferencesState(profile: OpticalProfileDto): PreferencesState {
  return {
    preferredShapes: profile.preferredShapes,
    preferredMaterials: profile.preferredMaterials,
    preferredColors: profile.preferredColors,
    preferredStyles: profile.preferredStyles,
  };
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function OpticalProfilePage() {
  const { data: profile } = useOpticalProfileQuery(true);
  const updateProfile = useUpdateOpticalProfileMutation();

  const [measurements, setMeasurements] = useState<MeasurementsState>({
    currentFrameLensWidth: "",
    currentFrameBridgeWidth: "",
    currentFrameTempleLength: "",
    currentFrameLensHeight: "",
  });
  const [preferences, setPreferences] = useState<PreferencesState>({
    preferredShapes: [],
    preferredMaterials: [],
    preferredColors: [],
    preferredStyles: [],
  });

  // Re-syncs only when the loaded/saved profile itself changes — same
  // pattern as ProfilePage, not on every keystroke/toggle.
  useEffect(() => {
    if (!profile) return;
    setMeasurements(toMeasurementsState(profile));
    setPreferences(toPreferencesState(profile));
  }, [profile]);

  const isDirty = useMemo(() => {
    if (!profile) return false;
    const savedMeasurements = toMeasurementsState(profile);
    const measurementsChanged = (Object.keys(measurements) as (keyof MeasurementsState)[]).some(
      (key) => measurements[key] !== savedMeasurements[key],
    );
    const preferencesChanged =
      preferences.preferredShapes.length !== profile.preferredShapes.length ||
      preferences.preferredMaterials.length !== profile.preferredMaterials.length ||
      preferences.preferredColors.length !== profile.preferredColors.length ||
      preferences.preferredStyles.length !== profile.preferredStyles.length ||
      !preferences.preferredShapes.every((v) => profile.preferredShapes.includes(v)) ||
      !preferences.preferredMaterials.every((v) => profile.preferredMaterials.includes(v)) ||
      !preferences.preferredColors.every((v) => profile.preferredColors.includes(v)) ||
      !preferences.preferredStyles.every((v) => profile.preferredStyles.includes(v));
    return measurementsChanged || preferencesChanged;
  }, [profile, measurements, preferences]);

  function parseMeasurement(raw: string): number | null {
    if (raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    updateProfile.mutate({
      currentFrameLensWidth: parseMeasurement(measurements.currentFrameLensWidth),
      currentFrameBridgeWidth: parseMeasurement(measurements.currentFrameBridgeWidth),
      currentFrameTempleLength: parseMeasurement(measurements.currentFrameTempleLength),
      currentFrameLensHeight: parseMeasurement(measurements.currentFrameLensHeight),
      ...preferences,
    });
  }

  if (!profile) return null;

  const errorMessage =
    updateProfile.error instanceof ApiClientError
      ? updateProfile.error.message
      : updateProfile.isError
        ? "No pudimos guardar los cambios. Probá de nuevo."
        : undefined;

  return (
    <div className="max-w-2xl">
      <SeoHead title="Mis medidas y preferencias" />

      <p className="text-sm text-text-muted">
        Guardá tus medidas y tus preferencias de estilo. Nos van a ayudar, en el futuro, a comparar
        modelos del catálogo con proporciones similares a tu armazón actual — no reemplazan una
        consulta profesional ni implican un análisis facial.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-10" noValidate>
        <section aria-labelledby="current-frame-heading">
          <h2 id="current-frame-heading" className="font-display text-lg font-semibold text-text">
            Tu armazón actual
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Estas medidas nos ayudarán a comparar modelos con proporciones similares a tu armazón
            actual. Completá las que conozcas — no hace falta saber las tres.
          </p>

          <div className="mt-4">
            <FrameMarkingDiagram />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MeasurementField
              label="Ancho del lente"
              value={measurements.currentFrameLensWidth}
              onChange={(v) => setMeasurements((m) => ({ ...m, currentFrameLensWidth: v }))}
              error={fieldErrorFor(updateProfile.error, "currentFrameLensWidth")}
            />
            <MeasurementField
              label="Ancho del puente"
              value={measurements.currentFrameBridgeWidth}
              onChange={(v) => setMeasurements((m) => ({ ...m, currentFrameBridgeWidth: v }))}
              error={fieldErrorFor(updateProfile.error, "currentFrameBridgeWidth")}
            />
            <MeasurementField
              label="Largo de patilla"
              value={measurements.currentFrameTempleLength}
              onChange={(v) => setMeasurements((m) => ({ ...m, currentFrameTempleLength: v }))}
              error={fieldErrorFor(updateProfile.error, "currentFrameTempleLength")}
            />
            <MeasurementField
              label="Altura del lente"
              value={measurements.currentFrameLensHeight}
              onChange={(v) => setMeasurements((m) => ({ ...m, currentFrameLensHeight: v }))}
              error={fieldErrorFor(updateProfile.error, "currentFrameLensHeight")}
            />
          </div>
        </section>

        <section aria-labelledby="shapes-heading">
          <h2 id="shapes-heading" className="font-display text-lg font-semibold text-text">
            Formas que te gustan
          </h2>
          <div className="mt-3">
            <PreferenceChipGroup
              legend="Formas que te gustan"
              options={FRAME_SHAPE_OPTIONS}
              selected={preferences.preferredShapes}
              onToggle={(value) =>
                setPreferences((p) => ({ ...p, preferredShapes: toggle(p.preferredShapes, value) }))
              }
            />
          </div>
        </section>

        <section aria-labelledby="materials-heading">
          <h2 id="materials-heading" className="font-display text-lg font-semibold text-text">
            Materiales
          </h2>
          <div className="mt-3">
            <PreferenceChipGroup
              legend="Materiales"
              options={FRAME_MATERIAL_OPTIONS}
              selected={preferences.preferredMaterials}
              onToggle={(value) =>
                setPreferences((p) => ({
                  ...p,
                  preferredMaterials: toggle(p.preferredMaterials, value),
                }))
              }
            />
          </div>
        </section>

        <section aria-labelledby="colors-heading">
          <h2 id="colors-heading" className="font-display text-lg font-semibold text-text">
            Colores
          </h2>
          <div className="mt-3">
            <PreferenceChipGroup
              legend="Colores"
              options={COLOR_FAMILY_OPTIONS}
              selected={preferences.preferredColors}
              onToggle={(value) =>
                setPreferences((p) => ({ ...p, preferredColors: toggle(p.preferredColors, value) }))
              }
            />
          </div>
        </section>

        <section aria-labelledby="style-heading">
          <h2 id="style-heading" className="font-display text-lg font-semibold text-text">
            Tu estilo
          </h2>
          <div className="mt-3">
            <PreferenceChipGroup
              legend="Tu estilo"
              options={STYLE_PREFERENCE_OPTIONS}
              selected={preferences.preferredStyles}
              onToggle={(value) =>
                setPreferences((p) => ({ ...p, preferredStyles: toggle(p.preferredStyles, value) }))
              }
            />
          </div>
        </section>

        {updateProfile.isSuccess && !updateProfile.isPending && !isDirty && (
          <p role="status" className="text-sm text-success">
            Los cambios se guardaron correctamente.
          </p>
        )}
        {errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={updateProfile.isPending || !isDirty}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {updateProfile.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}

function fieldErrorFor(error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiClientError)) return undefined;
  const details = error.details as { fieldErrors?: Record<string, string[]> } | undefined;
  return details?.fieldErrors?.[field]?.[0];
}

function MeasurementField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  // "(mm)" lives in the label itself — visible without forcing the
  // customer to type units (§28), and doesn't depend on overlaying text
  // on top of FormField's own layout.
  return (
    <FormField
      label={`${label} (mm)`}
      type="number"
      inputMode="decimal"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error}
    />
  );
}
