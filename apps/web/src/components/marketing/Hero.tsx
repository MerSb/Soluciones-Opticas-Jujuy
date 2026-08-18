import { Link } from "react-router-dom";
import { WhatsAppButton } from "../ui/WhatsAppButton";

// No photography — none exists yet, and stock/hotlinked images were
// explicitly ruled out (see docs/API.md-adjacent decision in the final
// report). The two-circle motif is pure CSS, decorative (aria-hidden),
// and evokes lenses without pretending to be a real product photo. It's
// a placeholder for real storefront/product photography, not a
// permanent design choice — swapping it for a photo later only touches
// this component.
function LensMotif() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -right-16 top-8 h-72 w-72 rounded-full border-[3px] border-primary/20" />
      <div className="absolute -right-40 top-24 h-72 w-72 rounded-full border-[3px] border-accent/25" />
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border bg-surface-muted">
      <LensMotif />
      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="max-w-2xl">
          <h1 className="text-balance font-display text-4xl text-text sm:text-5xl">
            Anteojos recetados, de sol y deportivos en Jujuy
          </h1>
          <p className="mt-6 max-w-xl text-lg text-text-muted">
            En Soluciones Ópticas te ayudamos a encontrar el armazón adecuado, con asesoramiento
            profesional y atención personalizada en cada sucursal.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/products"
              className="rounded-md bg-primary px-5 py-3 text-sm font-medium text-surface hover:bg-primary-dark"
            >
              Ver catálogo
            </Link>
            <WhatsAppButton message="Hola, quisiera hacer una consulta.">
              Escribinos por WhatsApp
            </WhatsAppButton>
          </div>
        </div>
      </div>
    </section>
  );
}
