import storefrontPhoto from "../../assets/storefront/soluciones-opticas-local.webp";
import { Container } from "../../components/ui/Container";
import { WhatsAppButton } from "../../components/ui/WhatsAppButton";
import { siteContent } from "../../content/site-content";
import { buildMapsUrl } from "../../lib/maps";
import { toTelHref } from "../../lib/format-phone";

const PIN_ICON = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
  >
    <path
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 21s-7-6.3-7-11a7 7 0 1 1 14 0c0 4.7-7 11-7 11Z"
    />
    <circle cx="12" cy="10" r="2.25" strokeWidth="1.5" />
  </svg>
);

const PHONE_ICON = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
  >
    <path
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 5c0 8.28 6.72 15 15 15l1.5-3.6a1 1 0 0 0-.6-1.32l-3.4-1.2a1 1 0 0 0-1.1.3l-1 1.2a11.8 11.8 0 0 1-5.8-5.8l1.2-1a1 1 0 0 0 .3-1.1l-1.2-3.4A1 1 0 0 0 7.6 3.5L4 5Z"
    />
  </svg>
);

// §10: a real, unedited photo of the physical store — institutional
// proof, not a second product hero. Deliberately calmer than Hero:
// static (no parallax/entrance choreography), no cyan product lighting
// of its own, a plain rounded-corner frame instead of the Hero's
// integrated/masked treatment — the goal here is "this belongs to a
// real local business," not "look at this product."
export function StoreShowcaseSection() {
  return (
    <section className="py-16">
      <Container>
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="overflow-hidden rounded-lg border border-border shadow-soft">
            <img
              src={storefrontPhoto}
              alt="Fachada del local de Soluciones Ópticas en Alvear 732, San Salvador de Jujuy"
              className="h-full w-full object-cover"
              width={1000}
              height={1333}
              loading="lazy"
              decoding="async"
            />
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Soluciones Ópticas en Jujuy
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-text sm:text-3xl">
              Un local a la calle, en el centro de San Salvador de Jujuy
            </h2>
            <p className="mt-4 max-w-lg text-text-muted">{siteContent.services.join(", ")}.</p>

            {(siteContent.address || siteContent.phone) && (
              <div className="mt-6 space-y-2 text-sm text-text-muted">
                {siteContent.address && (
                  <p className="flex items-center gap-2">
                    {PIN_ICON}
                    {siteContent.address}
                  </p>
                )}
                {siteContent.phone && (
                  <a
                    href={toTelHref(siteContent.phone)}
                    className="flex w-fit items-center gap-2 hover:text-text"
                  >
                    {PHONE_ICON}
                    {siteContent.phone}
                  </a>
                )}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-4">
              {siteContent.address && (
                <a
                  href={buildMapsUrl({ googleMapsUrl: null, address: siteContent.address })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-border px-5 py-3 text-sm font-semibold text-text transition-colors duration-200 hover:border-primary hover:text-primary"
                >
                  Cómo llegar
                </a>
              )}
              <WhatsAppButton message="Hola, quisiera hacer una consulta.">
                Escribinos por WhatsApp
              </WhatsAppButton>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
