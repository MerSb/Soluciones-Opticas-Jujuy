import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";
import { useHealthQuery } from "../services/queries/health";

export function HomePage() {
  return (
    <>
      <SeoHead
        title="Inicio"
        description="Óptica en Jujuy — anteojos recetados, de sol y deportivos."
        canonicalPath="/"
      />
      <Container className="py-16">
        <h1 className="font-display text-4xl text-text">Soluciones Ópticas</h1>
        <p className="mt-4 max-w-2xl text-text-muted">
          Sitio en construcción — el catálogo y la información institucional se incorporan en las
          próximas etapas.
        </p>
        <DevConnectivityCheck />
      </Container>
    </>
  );
}

// Dev-only (import.meta.env.DEV is statically stripped from production
// builds) — a live, honest check that the frontend can reach the API,
// without shipping a debug widget to the real homepage. See §21.
function DevConnectivityCheck() {
  const { data, isLoading, isError } = useHealthQuery();

  if (!import.meta.env.DEV) return null;

  return (
    <p className="mt-8 text-xs text-text-muted">
      API: {isLoading ? "verificando…" : isError ? "sin conexión" : (data?.status ?? "desconocido")}
    </p>
  );
}
