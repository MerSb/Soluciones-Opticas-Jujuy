import { Link } from "react-router-dom";
import { WhatsAppButton } from "../ui/WhatsAppButton";

// A dark section (not a full-bleed cyan block) with cyan reserved for
// the interactive elements — a solid bright-cyan background would read
// as a marketplace banner, not the restrained "minimal but visually
// strong" identity ADR-0016 asks for.
export function CTASection() {
  return (
    <section className="border-t border-border bg-surface-muted">
      <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h2 className="font-display text-2xl text-text sm:text-3xl">¿Tenés alguna consulta?</h2>
        <p className="mx-auto mt-3 max-w-xl text-text-muted">
          Escribinos por WhatsApp o conocé nuestra información de contacto y sucursales.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <WhatsAppButton message="Hola, quisiera hacer una consulta.">
            Escribinos por WhatsApp
          </WhatsAppButton>
          <Link
            to="/contact"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text hover:border-primary hover:text-primary"
          >
            Ver información de contacto
          </Link>
        </div>
      </div>
    </section>
  );
}
