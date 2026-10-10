import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Container } from "../../components/ui/Container";
import { SeoHead } from "../../components/ui/SeoHead";
import { FormField } from "../../components/forms/FormField";
import { useRegisterMutation } from "../../services/queries/auth";
import { useAddFavoriteMutation } from "../../services/queries/favorites";
import { siteContent } from "../../content/site-content";
import { buildWhatsAppUrl } from "../../lib/whatsapp";
import {
  PASSWORD_MIN_LENGTH,
  describeAuthFailure,
  hasErrors,
  needsFormAlert,
  validateRegister,
} from "../../lib/auth-form";
import type { FieldErrors, RegisterField, RegisterValues } from "../../lib/auth-form";

interface LocationState {
  from?: string;
  favoriteSlug?: string;
}

// Same order as registerBodySchema: a 400's curated message describes the
// first invalid field in this order (see describeAuthFailure).
const FIELDS: readonly RegisterField[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "password",
  "confirmPassword",
];

const EMPTY_VALUES: RegisterValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

// No optical measurements, no unnecessary fields — registration stays
// quick (§28 of the auth brief).
export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const register = useRegisterMutation();
  const addFavorite = useAddFavoriteMutation();

  const formRef = useRef<HTMLFormElement>(null);
  // isPending only flips after a re-render; this guards a double click or
  // a double Enter landing before that.
  const submittingRef = useRef(false);
  const [values, setValues] = useState<RegisterValues>(EMPTY_VALUES);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<RegisterField>>({});

  const failure = register.isError ? describeAuthFailure(register.error, "register", FIELDS) : null;
  const visibleErrors: FieldErrors<RegisterField> = { ...failure?.fieldErrors, ...fieldErrors };

  function focusField(field: RegisterField) {
    const element = formRef.current?.elements.namedItem(field);
    if (element instanceof HTMLInputElement) element.focus();
  }

  function update(field: RegisterField, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current || register.isPending) return;

    const errors = validateRegister(values);
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      register.reset();
      const first = FIELDS.find((field) => errors[field]);
      if (first) focusField(first);
      return;
    }

    submittingRef.current = true;
    register.mutate(
      {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        phone: values.phone.trim() || undefined,
        password: values.password,
      },
      {
        onSuccess: async () => {
          if (state.favoriteSlug) {
            await addFavorite.mutateAsync(state.favoriteSlug).catch(() => {});
          }
          navigate(state.from ?? "/account", { replace: true });
        },
        onError: (error) => {
          const serverErrors = describeAuthFailure(error, "register", FIELDS).fieldErrors;
          const field = FIELDS.find((name) => serverErrors[name]);
          if (field) focusField(field);
        },
        onSettled: () => {
          submittingRef.current = false;
        },
      },
    );
  }

  return (
    <Container className="flex justify-center py-16">
      <SeoHead title="Crear cuenta" />
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-text">Creá tu cuenta</h1>
        <p className="mt-1 text-sm text-text-muted">
          Guardá tus productos favoritos y accedé más rápido la próxima vez.
        </p>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="mt-8 space-y-5"
          noValidate
          aria-busy={register.isPending}
        >
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Nombre"
              name="firstName"
              autoComplete="given-name"
              required
              value={values.firstName}
              error={visibleErrors.firstName}
              onChange={(event) => update("firstName", event.target.value)}
            />
            <FormField
              label="Apellido"
              name="lastName"
              autoComplete="family-name"
              required
              value={values.lastName}
              error={visibleErrors.lastName}
              onChange={(event) => update("lastName", event.target.value)}
            />
          </div>
          <FormField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={values.email}
            error={visibleErrors.email}
            onChange={(event) => update("email", event.target.value)}
          />
          <FormField
            label="Teléfono (opcional)"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={values.phone}
            error={visibleErrors.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
          <FormField
            label="Contraseña"
            name="password"
            toggleVisibility
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`}
            value={values.password}
            error={visibleErrors.password}
            onChange={(event) => update("password", event.target.value)}
          />
          <FormField
            label="Repetir contraseña"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={values.confirmPassword}
            error={visibleErrors.confirmPassword}
            onChange={(event) => update("confirmPassword", event.target.value)}
          />

          {failure && needsFormAlert(failure) && (
            <div role="alert" className="text-sm text-danger">
              <p>{failure.message}</p>
              {failure.kind === "email-taken" && (
                <p className="mt-1 text-text-muted">
                  Si es tuya,{" "}
                  <Link
                    to="/login"
                    state={{ ...state, email: values.email.trim() }}
                    className="font-medium text-primary hover:underline"
                  >
                    iniciá sesión
                  </Link>
                  .
                  {siteContent.whatsappNumber && (
                    <>
                      {" "}
                      Si no recordás tu contraseña,{" "}
                      <a
                        href={buildWhatsAppUrl(
                          siteContent.whatsappNumber,
                          "Hola, necesito ayuda para recuperar el acceso a mi cuenta.",
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary hover:underline"
                      >
                        escribinos por WhatsApp
                      </a>
                      .
                    </>
                  )}
                </p>
              )}
            </div>
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
