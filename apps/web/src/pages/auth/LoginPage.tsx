import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Container } from "../../components/ui/Container";
import { SeoHead } from "../../components/ui/SeoHead";
import { FormField } from "../../components/forms/FormField";
import { useLoginMutation } from "../../services/queries/auth";
import { useAddFavoriteMutation } from "../../services/queries/favorites";
import { describeAuthFailure, hasErrors, needsFormAlert, validateLogin } from "../../lib/auth-form";
import type { FieldErrors, LoginField } from "../../lib/auth-form";

interface LocationState {
  from?: string;
  /** Set by FavoriteButton when a guest tried to favorite a product —
   * finished here once login succeeds, instead of just dropped (§24). */
  favoriteSlug?: string;
  /** Prefilled when RegisterPage sends someone here after a duplicate email. */
  email?: string;
}

const FIELDS: readonly LoginField[] = ["email", "password"];

// The two eyes + mouth shared by every character below — the only part
// of the illustration with real behavior (mouse-gaze tracking, closing
// while a password is typed), so it's the one piece worth factoring out
// of the four otherwise-unique blob shapes.
function Face({
  colorClassName,
  positionClassName,
  leftEyeClassName,
  rightEyeClassName,
  mouthClassName,
  closed,
}: {
  colorClassName: string;
  positionClassName: string;
  leftEyeClassName: string;
  rightEyeClassName: string;
  mouthClassName: string;
  closed: boolean;
}) {
  // Open: a small filled dot, nudged toward the cursor. Closed: the
  // same dot squashed flat into a blink line — scaleY, not a border/
  // rotate trick, so the two states are actually visually distinct
  // instead of two arcs that read the same either way.
  const eyeStyle: CSSProperties = closed
    ? { transform: "scaleY(0.15)" }
    : { transform: "translate(calc(var(--gaze-x, 0) * 3px), calc(var(--gaze-y, 0) * 2px))" };

  return (
    <div aria-hidden="true" className={`absolute ${colorClassName} ${positionClassName}`}>
      <span
        className={`absolute h-[6px] w-[6px] rounded-full bg-current transition-transform duration-150 ease-out ${leftEyeClassName}`}
        style={eyeStyle}
      />
      <span
        className={`absolute h-[6px] w-[6px] rounded-full bg-current transition-transform duration-150 ease-out ${rightEyeClassName}`}
        style={eyeStyle}
      />
      {/* border-bottom (not border-top) + rounded-full traces a "bowl"
          curve, ∪ — a smile. border-top traces the opposite "dome," ∩,
          which read as a frown/worried face. Same shape in every state
          (open or closed eyes) — a face doesn't need a second mouth
          just because its eyes did something. */}
      <span
        className={`absolute h-[8px] w-[14px] rounded-full border-b-[3px] border-current ${mouthClassName}`}
      />
    </div>
  );
}

// Four small characters that "look away" while a password is being
// typed — a lighthearted reaction to the one moment on this page where
// the customer is entering something private. Purely decorative
// (aria-hidden on every shape); the caption text next to it carries the
// same idea in words for anyone not seeing the animation.
function PasswordAwareIllustration({ isTypingPassword }: { isTypingPassword: boolean }) {
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Eyes follow the cursor while the customer isn't typing a password
  // yet; once they are, tracking stops and the "closed eyes" state
  // (driven by `isTypingPassword` alone) takes over instead.
  useEffect(() => {
    if (isTypingPassword) {
      setGaze({ x: 0, y: 0 });
      return;
    }

    let frame: number | null = null;
    function handleMouseMove(event: MouseEvent) {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const clamp = (value: number) => Math.max(-1, Math.min(1, value));
        setGaze({
          x: clamp((event.clientX - cx) / (window.innerWidth / 2)),
          y: clamp((event.clientY - cy) / (window.innerHeight / 2)),
        });
      });
    }

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [isTypingPassword]);

  return (
    <div
      className="relative hidden h-full flex-col items-center justify-end overflow-hidden bg-surface-sunken px-10 pb-10 pt-10 md:flex"
      style={
        {
          backgroundImage:
            "radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--color-primary) 16%, transparent), transparent 60%)",
        } as CSSProperties
      }
    >
      <div
        ref={containerRef}
        className="relative h-[220px] w-[280px] scale-90 lg:scale-100"
        style={{ "--gaze-x": gaze.x, "--gaze-y": gaze.y } as CSSProperties}
      >
        {/* Cyan */}
        <div
          className={`absolute bottom-0 left-[10px] h-[95px] w-[140px] rounded-t-[90px] bg-primary transition-transform duration-300 ease-out`}
        />
        <Face
          closed={isTypingPassword}
          colorClassName="text-[#0a2530]"
          positionClassName="bottom-[43px] left-[65px] h-0 w-0"
          leftEyeClassName="left-0 top-0"
          rightEyeClassName="left-[24px] top-0"
          mouthClassName="left-[9px] top-[12px]"
        />

        {/* Ink */}
        <div
          className={`absolute bottom-[75px] left-[55px] h-[120px] w-[62px] rounded-t-[5px] bg-text transition-transform duration-300 ease-out ${
            isTypingPassword ? "-translate-x-[10px] -rotate-[23deg]" : "-rotate-[13deg]"
          }`}
        />
        <Face
          closed={isTypingPassword}
          colorClassName="text-surface"
          positionClassName="bottom-[112px] left-[75px] h-0 w-0"
          leftEyeClassName="left-0 top-0"
          rightEyeClassName="left-[19px] top-0"
          mouthClassName="left-[7px] top-[11px]"
        />

        {/* Paper */}
        <div
          className={`absolute bottom-[57px] left-[108px] h-[108px] w-[68px] rounded-t-[8px] border border-border bg-surface-muted transition-transform duration-300 ease-out ${
            isTypingPassword ? "rotate-[7deg]" : ""
          }`}
        />
        <Face
          closed={isTypingPassword}
          colorClassName="text-text"
          positionClassName="bottom-[91px] left-[127px] h-0 w-0"
          leftEyeClassName="left-0 top-0"
          rightEyeClassName="left-[21px] top-0"
          mouthClassName="left-[9px] top-[12px]"
        />

        {/* Sky */}
        <div
          className={`absolute bottom-0 left-[170px] h-[88px] w-[66px] rounded-t-[44px] bg-accent transition-transform duration-300 ease-out ${
            isTypingPassword ? "translate-x-[9px]" : ""
          }`}
        />
        <Face
          closed={isTypingPassword}
          colorClassName="text-[#0a2530]"
          positionClassName="bottom-[35px] left-[192px] h-0 w-0"
          leftEyeClassName="left-0 top-0"
          rightEyeClassName="left-[18px] top-0"
          mouthClassName="left-[6px] top-[12px]"
        />
      </div>

      <p className="relative mt-8 text-center text-sm text-text-muted">
        {isTypingPassword ? "Shh, no estamos mirando 👀" : "¡Hola de nuevo!"}
      </p>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const login = useLoginMutation();
  const addFavorite = useAddFavoriteMutation();

  const formRef = useRef<HTMLFormElement>(null);
  // isPending only flips after a re-render; this guards a double click or
  // a double Enter landing before that.
  const submittingRef = useRef(false);
  const [email, setEmail] = useState(state.email ?? "");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<LoginField>>({});
  const isTypingPassword = password.length > 0;

  // 401 stays one generic message for both fields — never says whether
  // the email exists (the API answers the same way for both cases).
  const failure = login.isError ? describeAuthFailure(login.error, "login", FIELDS) : null;
  const visibleErrors: FieldErrors<LoginField> = { ...failure?.fieldErrors, ...fieldErrors };

  function focusField(field: LoginField) {
    const element = formRef.current?.elements.namedItem(field);
    if (element instanceof HTMLInputElement) element.focus();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current || login.isPending) return;

    const errors = validateLogin({ email, password });
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      login.reset();
      const first = FIELDS.find((field) => errors[field]);
      if (first) focusField(first);
      return;
    }

    submittingRef.current = true;
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: async () => {
          if (state.favoriteSlug) {
            // Best-effort — a failure here shouldn't block getting the
            // customer to where they were headed.
            await addFavorite.mutateAsync(state.favoriteSlug).catch(() => {});
          }
          navigate(state.from ?? "/account", { replace: true });
        },
        onSettled: () => {
          submittingRef.current = false;
        },
      },
    );
  }

  return (
    <Container className="flex justify-center py-16">
      <SeoHead noIndex title="Ingresar" />
      <div className="grid w-full max-w-[960px] grid-cols-1 overflow-hidden rounded-lg border border-border bg-surface-muted shadow-elevated md:grid-cols-2">
        <PasswordAwareIllustration isTypingPassword={isTypingPassword} />

        <div className="px-6 py-12 sm:px-12">
          <h1 className="font-display text-2xl font-semibold text-text">Ingresá a tu cuenta</h1>
          <p className="mt-1 text-sm text-text-muted">
            Accedé a tus favoritos y a tu información de contacto.
          </p>

          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="mt-8 space-y-5"
            noValidate
            aria-busy={login.isPending}
          >
            <FormField
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              error={visibleErrors.email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
            />
            <FormField
              label="Contraseña"
              name="password"
              toggleVisibility
              autoComplete="current-password"
              required
              value={password}
              error={visibleErrors.password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
            />

            {failure && needsFormAlert(failure) && (
              <p role="alert" className="text-sm text-danger">
                {failure.message}
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
      </div>
    </Container>
  );
}
