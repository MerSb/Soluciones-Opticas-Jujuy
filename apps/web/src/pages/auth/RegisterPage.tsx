import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Container } from "../../components/ui/Container";
import { SeoHead } from "../../components/ui/SeoHead";
import { FormField } from "../../components/forms/FormField";
import { useRegisterMutation } from "../../services/queries/auth";
import { useAddFavoriteMutation } from "../../services/queries/favorites";
import { ApiClientError } from "../../services/api-client";

interface LocationState {
  from?: string;
  favoriteSlug?: string;
}

// No optical measurements, no unnecessary fields — registration stays
// quick (§28 of the auth brief).
export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const register = useRegisterMutation();
  const addFavorite = useAddFavoriteMutation();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    register.mutate(
      { firstName, lastName, email, phone: phone || undefined, password },
      {
        onSuccess: async () => {
          if (state.favoriteSlug) {
            await addFavorite.mutateAsync(state.favoriteSlug).catch(() => {});
          }
          navigate(state.from ?? "/account", { replace: true });
        },
      },
    );
  }

  const errorMessage =
    register.error instanceof ApiClientError
      ? register.error.message
      : register.isError
        ? "Ocurrió un error. Probá de nuevo."
        : undefined;

  return (
    <Container className="flex justify-center py-16">
      <SeoHead title="Crear cuenta" />
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-text">Creá tu cuenta</h1>
        <p className="mt-1 text-sm text-text-muted">
          Guardá tus productos favoritos y accedé más rápido la próxima vez.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
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
          <FormField
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <FormField
            label="Teléfono (opcional)"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <FormField
            label="Contraseña"
            toggleVisibility
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="-mt-3 text-xs text-text-muted">Mínimo 8 caracteres.</p>

          {errorMessage && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={register.isPending}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {register.isPending ? "Creando cuenta…" : "Crear cuenta"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          ¿Ya tenés cuenta?{" "}
          <Link to="/login" state={state} className="font-medium text-primary hover:underline">
            Ingresá
          </Link>
        </p>
      </div>
    </Container>
  );
}
