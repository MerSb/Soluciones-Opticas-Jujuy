import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/marketing/SectionHeading";
import { ContactMethodCard } from "../components/ui/ContactMethodCard";
import { WhatsAppButton } from "../components/ui/WhatsAppButton";
import { siteContent } from "../content/site-content";
import { toTelHref } from "../lib/format-phone";

const PENDING = <span className="text-text-muted">A confirmar</span>;

export function ContactPage() {
  return (
    <>
      <SeoHead
        title="Contacto"
        description="Contactanos por WhatsApp, teléfono o email."
        canonicalPath="/contact"
      />
      <Container className="py-16">
        <SectionHeading eyebrow="Contacto" title="Hablemos" />

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ContactMethodCard
            label="WhatsApp"
            value={
              <WhatsAppButton message="Hola, quisiera hacer una consulta.">
                Escribinos
              </WhatsAppButton>
            }
          />
          <ContactMethodCard
            label="Teléfono"
            value={
              siteContent.phone ? (
                <a href={toTelHref(siteContent.phone)} className="text-primary hover:underline">
                  {siteContent.phone}
                </a>
              ) : (
                PENDING
              )
            }
          />
          <ContactMethodCard
            label="Email"
            value={
              siteContent.email ? (
                <a href={`mailto:${siteContent.email}`} className="text-primary hover:underline">
                  {siteContent.email}
                </a>
              ) : (
                PENDING
              )
            }
          />
          <ContactMethodCard
            label="Sucursales"
            value={
              <Link to="/branches" className="text-primary hover:underline">
                Ver sucursales y horarios
              </Link>
            }
          />
        </div>

        <div className="mt-16 max-w-xl">
          <ContactForm />
        </div>
      </Container>
    </>
  );
}

// UI-only — no backend endpoint exists yet (explicitly out of scope for
// this step). The helper text above the form discloses that upfront,
// before anyone invests time filling it in, rather than after a
// submit that silently goes nowhere. No React Hook Form: nothing here
// is submitted anywhere, so a validation library buys nothing yet —
// native HTML5 required/type attributes are enough for now.
function ContactForm() {
  const [wasSubmitted, setWasSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWasSubmitted(true);
  }

  return (
    <section>
      <h2 className="font-display text-xl text-text">Escribinos</h2>
      <p className="mt-2 text-sm text-text-muted">
        Este formulario todavía no envía mensajes de forma automática. Mientras lo habilitamos,
        contactanos por WhatsApp o teléfono para una respuesta más rápida.
      </p>

      <form onSubmit={handleSubmit} noValidate={false} className="mt-6 space-y-4">
        <div>
          <label htmlFor="contact-name" className="block text-sm font-medium text-text">
            Nombre
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className="mt-1 block w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-text focus-visible:border-primary"
          />
        </div>

        <div>
          <label htmlFor="contact-email" className="block text-sm font-medium text-text">
            Email
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 block w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-text focus-visible:border-primary"
          />
        </div>

        <div>
          <label htmlFor="contact-message" className="block text-sm font-medium text-text">
            Mensaje
          </label>
          <textarea
            id="contact-message"
            name="message"
            rows={4}
            required
            className="mt-1 block w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-text focus-visible:border-primary"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-surface hover:bg-primary-dark"
        >
          Enviar mensaje
        </button>

        {wasSubmitted && (
          <p role="status" className="text-sm text-text-muted">
            Gracias por el interés — este formulario todavía no está conectado. Por favor,
            contactanos por WhatsApp o teléfono mientras tanto.
          </p>
        )}
      </form>
    </section>
  );
}
