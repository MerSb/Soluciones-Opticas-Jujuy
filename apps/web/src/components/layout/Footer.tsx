import { Link } from "react-router-dom";
import { siteContent } from "../../content/site-content";
import { buildWhatsAppUrl } from "../../lib/whatsapp";
import { toTelHref } from "../../lib/format-phone";
import { LEGAL_PAGES } from "../../content/legal/status";
import { SHOW_LEGAL_DRAFTS } from "../../content/legal/visibility";

// Contact, location and legal links on every page. Only confirmed data
// (site-content.ts); "Cómo llegar" is a Google Maps search for the
// confirmed address — no invented map pin, hours or social profiles.
// Legal pages are linked only once approved (content/legal/status.ts);
// drafts only in `npm run dev`.

const LEGAL_LINKS = LEGAL_PAGES.filter((page) => SHOW_LEGAL_DRAFTS || page.approved);

const LINK =
  "inline-flex min-h-6 items-center text-text-muted underline decoration-text-muted/50 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary";

export function Footer() {
  const { businessName, address, phone, whatsappNumber } = siteContent;
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${businessName}, ${address}, Argentina`)}`
    : null;

  return (
    <footer className="border-t border-border bg-surface-muted">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <p className="font-display text-base font-semibold text-text">{businessName}</p>
          {address && <p className="mt-2 text-text-muted">{address}</p>}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-1 inline-block ${LINK}`}
            >
              Cómo llegar
            </a>
          )}
        </div>

        <div>
          <p className="font-semibold text-text">Contacto</p>
          <ul className="mt-2 space-y-1.5">
            {whatsappNumber && (
              <li>
                <a
                  href={buildWhatsAppUrl(whatsappNumber, "Hola, quisiera hacer una consulta.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK}
                >
                  WhatsApp {phone}
                </a>
              </li>
            )}
            {phone && (
              <li>
                <a href={toTelHref(phone)} className={LINK}>
                  Llamar al {phone}
                </a>
              </li>
            )}
            <li>
              <Link to="/contact" className={LINK}>
                Página de contacto
              </Link>
            </li>
          </ul>
        </div>

        {LEGAL_LINKS.length > 0 && (
          <nav aria-label="Información legal">
            <p className="font-semibold text-text">Información</p>
            <ul className="mt-2 space-y-1.5">
              {LEGAL_LINKS.map((page) => (
                <li key={page.slug}>
                  <Link to={`/${page.slug}`} className={LINK}>
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-text-muted sm:px-6 lg:px-8">
          © {new Date().getFullYear()} {businessName}. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
