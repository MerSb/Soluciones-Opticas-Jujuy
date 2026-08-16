import type { ReactNode } from "react";

type Variant = "loading" | "error" | "empty" | "not-found";

interface StatusMessageProps {
  variant: Variant;
  heading?: string;
  message: string;
  action?: ReactNode;
}

const DEFAULT_HEADINGS: Record<Variant, string> = {
  loading: "Cargando…",
  error: "Ocurrió un error",
  empty: "No hay resultados",
  "not-found": "No encontrado",
};

// One component, not four — loading/error/empty/not-found share the same
// shape (heading + message + optional action); native role="status" /
// role="alert" already give the correct live-region semantics, no extra
// ARIA needed on top.
export function StatusMessage({ variant, heading, message, action }: StatusMessageProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className="flex flex-col items-center gap-3 py-16 text-center"
    >
      <h2 className="font-display text-xl text-text">{heading ?? DEFAULT_HEADINGS[variant]}</h2>
      <p className="max-w-md text-text-muted">{message}</p>
      {action}
    </div>
  );
}
