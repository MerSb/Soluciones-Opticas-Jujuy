import { Link } from "react-router-dom";
import { WhatsAppButton } from "../ui/WhatsAppButton";

export function CTASection() {
  return (
    <section className="border-t border-border bg-primary">
      <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h2 className="font-display text-2xl text-surface sm:text-3xl">¿Tenés alguna consulta?</h2>
        <p className="mx-auto mt-3 max-w-xl text-surface/80">
          Escribinos por WhatsApp o conocé nuestra información de contacto y sucursales.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <WhatsAppButton message="Hola, quisiera hacer una consulta." variant="inverted">
            Escribinos por WhatsApp
          </WhatsAppButton>
          <Link
            to="/contact"
            className="rounded-md border border-surface/40 px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
          >
            Ver información de contacto
          </Link>
        </div>
      </div>
    </section>
  );
}
