import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Container } from "../../components/ui/Container";
import { SeoHead } from "../../components/ui/SeoHead";
import { FormField } from "../../components/forms/FormField";
import { useLoginMutation } from "../../services/queries/auth";
import { useAddFavoriteMutation } from "../../services/queries/favorites";
import { ApiClientError } from "../../services/api-client";

interface LocationState {
  from?: string;
  /** Set by FavoriteButton when a guest tried to favorite a product —
   * finished here once login succeeds, instead of just dropped (§24). */
  favoriteSlug?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const login = useLoginMutation();
  const addFavorite = useAddFavoriteMutation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: async () => {
          if (state.favoriteSlug) {
            // Best-effort — a failure here shouldn't block getting the
            // customer to where they were headed.
            await addFavorite.mutateAsync(state.favoriteSlug).catch(() => {});
          }
          navigate(state.from ?? "/account", { replace: true });
        },
      },
    );
  }

  const errorMessage =
    login.error instanceof ApiClientError
      ? login.error.message
      : login.isError
        ? "Ocurrió un error. Probá de nuevo."
        : undefined;

  return (
    <Container className="flex justify-center py-16">
      <SeoHead title="Ingresar" />
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-text">Ingresá a tu cuenta</h1>
        <p className="mt-1 text-sm text-text-muted">
          Accedé a tus favoritos y a tu información de contacto.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
          <FormField
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <FormField
            label="Contraseña"
            toggleVisibility
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {errorMessage && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {login.isPending ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          ¿No tenés cuenta?{" "}
          <Link to="/register" state={state} className="font-medium text-primary hover:underline">
            Registrate
          </Link>
        </p>
      </div>
    </Container>
  );
}
