import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { SeoHead } from "../../components/ui/SeoHead";
import { FormField } from "../../components/forms/FormField";
import { useCurrentUserQuery } from "../../services/queries/auth";
import { useUpdateProfileMutation } from "../../services/queries/profile";
import { ApiClientError } from "../../services/api-client";

export function ProfilePage() {
  const { data: user } = useCurrentUserQuery();
  const updateProfile = useUpdateProfileMutation();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");

  // Re-syncs the form only when the underlying user actually changes
  // (e.g. right after this same mutation succeeds) — not on every
  // keystroke, since these are otherwise plain controlled inputs.
  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setPhone(user.phone ?? "");
  }, [user]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    updateProfile.mutate({ firstName, lastName, phone: phone || null });
  }

  if (!user) return null;

  const errorMessage =
    updateProfile.error instanceof ApiClientError
      ? updateProfile.error.message
      : updateProfile.isError
        ? "No pudimos guardar los cambios. Probá de nuevo."
        : undefined;

  return (
    <div className="max-w-md">
      <SeoHead title="Mi perfil" />

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Nombre"
            autoComplete="given-name"
            required
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
          <FormField
            label="Apellido"
            autoComplete="family-name"
            required
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>

        {/* Email editing is deliberately deferred — it would need its
            own verification semantics (§20 of the auth brief), so this
            is shown read-only rather than silently allowing an edit
            that doesn't actually change anything server-side. */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-text">Email</span>
          <p className="rounded-md border border-border bg-surface-muted px-4 py-2.5 text-text-muted">
            {user.email}
          </p>
        </div>

        <FormField
          label="Teléfono"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />

        {updateProfile.isSuccess && !updateProfile.isPending && (
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
          disabled={updateProfile.isPending}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {updateProfile.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}
