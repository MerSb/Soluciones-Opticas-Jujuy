import { ApiClientError } from "../services/api-client";

// Client-side checks for the login/register forms. They mirror
// apps/api/src/schemas/auth.schema.ts only to give instant, per-field
// feedback — the API stays the authority and re-validates everything.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
const NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 255;
const PHONE_MIN_LENGTH = 6;
const PHONE_MAX_LENGTH = 30;

// Deliberately loose (something@something.tld): the API's Zod check is
// the strict one; this only catches obvious typos before a round trip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RegisterField =
  "firstName" | "lastName" | "email" | "phone" | "password" | "confirmPassword";
export type LoginField = "email" | "password";

export type FieldErrors<F extends string> = Partial<Record<F, string>>;

export interface RegisterValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

export interface LoginValues {
  email: string;
  password: string;
}

function emailError(email: string): string | undefined {
  const trimmed = email.trim();
  if (!trimmed) return "Ingresá tu email.";
  if (trimmed.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(trimmed)) {
    return "Ingresá un email válido (por ejemplo, nombre@correo.com).";
  }
  return undefined;
}

export function validateRegister(values: RegisterValues): FieldErrors<RegisterField> {
  const errors: FieldErrors<RegisterField> = {};

  const firstName = values.firstName.trim();
  if (!firstName) errors.firstName = "Ingresá tu nombre.";
  else if (firstName.length > NAME_MAX_LENGTH) errors.firstName = "El nombre es demasiado largo.";

  const lastName = values.lastName.trim();
  if (!lastName) errors.lastName = "Ingresá tu apellido.";
  else if (lastName.length > NAME_MAX_LENGTH) errors.lastName = "El apellido es demasiado largo.";

  const email = emailError(values.email);
  if (email) errors.email = email;

  const phone = values.phone.trim();
  if (phone && (phone.length < PHONE_MIN_LENGTH || phone.length > PHONE_MAX_LENGTH)) {
    errors.phone = `El teléfono debe tener entre ${PHONE_MIN_LENGTH} y ${PHONE_MAX_LENGTH} caracteres.`;
  }

  if (!values.password) errors.password = "Ingresá una contraseña.";
  else if (values.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  } else if (values.password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `La contraseña no puede superar los ${PASSWORD_MAX_LENGTH} caracteres.`;
  }

  if (!values.confirmPassword) errors.confirmPassword = "Repetí la contraseña.";
  else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Las contraseñas no coinciden.";
  }

  return errors;
}

// Login only checks presence/shape — never the password policy: an
// account created under an older policy must still be able to sign in.
export function validateLogin(values: LoginValues): FieldErrors<LoginField> {
  const errors: FieldErrors<LoginField> = {};
  const email = emailError(values.email);
  if (email) errors.email = email;
  if (!values.password) errors.password = "Ingresá tu contraseña.";
  return errors;
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}

export type AuthFailureKind =
  "network" | "validation" | "invalid-credentials" | "email-taken" | "rate-limited" | "unexpected";

export interface AuthFailure<F extends string> {
  kind: AuthFailureKind;
  /** Shown in the form-level alert. */
  message: string;
  fieldErrors: FieldErrors<F>;
}

export const NETWORK_ERROR_MESSAGE =
  "No pudimos conectarnos con el servidor. Revisá tu conexión a internet e intentá de nuevo.";
export const UNEXPECTED_ERROR_MESSAGE =
  "Ocurrió un error inesperado. Intentá de nuevo en unos minutos.";
export const INVALID_CREDENTIALS_MESSAGE = "Email o contraseña incorrectos.";
export const EMAIL_TAKEN_MESSAGE = "Ya existe una cuenta con este email.";
export const RATE_LIMITED_MESSAGE =
  "Hiciste demasiados intentos. Esperá unos minutos y volvé a intentar.";

// Which API messages may be shown verbatim: 400 messages come from
// lib/validation-messages.ts (curated Spanish, never Zod/DB internals).
// Everything else uses the fixed copy above — a 5xx body is never shown,
// whatever it says.
export function describeAuthFailure<F extends string>(
  error: unknown,
  context: "login" | "register",
  fields: readonly F[],
): AuthFailure<F> {
  // fetch() rejects with a TypeError, not an HTTP status, when the
  // request never completes — offline, DNS, or a CORS rejection.
  if (!(error instanceof ApiClientError)) {
    return { kind: "network", message: NETWORK_ERROR_MESSAGE, fieldErrors: {} };
  }

  if (error.status === 400 && error.code === "VALIDATION_ERROR") {
    const fieldErrors: FieldErrors<F> = {};
    const field = firstInvalidField(error.details, fields);
    // The field key comes from the API; the text is always the curated
    // top-level message (Zod's own per-field texts may be English).
    if (field) fieldErrors[field] = error.message;
    return { kind: "validation", message: error.message, fieldErrors };
  }

  if (context === "login" && error.status === 401) {
    return { kind: "invalid-credentials", message: INVALID_CREDENTIALS_MESSAGE, fieldErrors: {} };
  }

  if (context === "register" && error.status === 409) {
    const fieldErrors: FieldErrors<F> = {};
    if ((fields as readonly string[]).includes("email")) {
      fieldErrors["email" as F] = EMAIL_TAKEN_MESSAGE;
    }
    // The field says why; the form-level alert says what happened and
    // (in RegisterPage) what to do next — not the same sentence twice.
    return { kind: "email-taken", message: "No pudimos crear tu cuenta.", fieldErrors };
  }

  if (error.status === 429) {
    return { kind: "rate-limited", message: RATE_LIMITED_MESSAGE, fieldErrors: {} };
  }

  return { kind: "unexpected", message: UNEXPECTED_ERROR_MESSAGE, fieldErrors: {} };
}

// A 400 already pinned to a field is shown there only — the same sentence
// twice (field + form alert) would be read out twice by screen readers.
export function needsFormAlert<F extends string>(failure: AuthFailure<F> | null): boolean {
  return Boolean(failure) && !(failure!.kind === "validation" && hasErrors(failure!.fieldErrors));
}

function firstInvalidField<F extends string>(details: unknown, fields: readonly F[]): F | null {
  if (!details || typeof details !== "object" || !("fieldErrors" in details)) return null;
  const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object") return null;
  const invalid = Object.keys(fieldErrors);
  return fields.find((field) => invalid.includes(field)) ?? null;
}
