import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Root-level catch-all for uncaught render errors — React itself has no
// hook-based API for this yet, so a class component is the only option.
// Hand-rolled rather than react-error-boundary: the need (catch, log,
// show a graceful fallback) doesn't justify a dependency for ~25 lines.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled application error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center"
        >
          <h1 className="font-display text-2xl text-text">Ocurrió un error inesperado</h1>
          <p className="max-w-md text-text-muted">
            Algo salió mal al cargar la página. Probá recargar o volver al inicio.
          </p>
          <a
            href="/"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
          >
            Volver al inicio
          </a>
        </div>
      );
    }

    return this.props.children;
  }
}
