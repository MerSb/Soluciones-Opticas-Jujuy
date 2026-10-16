import { Link } from "react-router-dom";
import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";
import { WhatsAppButton } from "../components/ui/WhatsAppButton";

// Audit point 15. Unknown paths outside the app's routes also get a real
// HTTP 404 from Vercel (404.html, see vercel.json); inside the app this
// page explains it and offers the main ways back. Not indexed.
export function NotFoundPage() {
  return (
    <>
      <SeoHead noIndex title="Página no encontrada" />
      <Container className="py-16 sm:py-24">
        <div className="mx-auto max-w-xl text-center">
          <p className="font-display text-6xl font-extrabold text-primary sm:text-7xl">404</p>
          <h1 className="mt-4 font-display text-2xl font-semibold text-text sm:text-3xl">
            Página no encontrada
          </h1>
          <p className="mt-3 text-text-muted">
            La página que buscás no existe o fue movida. Podés seguir por acá:
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark"
            >
              Volver al inicio
            </Link>
            <Link
              to="/products"
              className="inline-flex min-h-11 items-center rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-text hover:border-primary"
            >
              Ver anteojos
            </Link>
            <Link
              to="/accesorios"
              className="inline-flex min-h-11 items-center rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-text hover:border-primary"
            >
              Ver accesorios
            </Link>
          </div>
          <div className="mt-6">
            <WhatsAppButton message="Hola, no encontré lo que buscaba en la web.">
              ¿Necesitás ayuda? Escribinos
            </WhatsAppButton>
          </div>
        </div>
      </Container>
    </>
  );
}
