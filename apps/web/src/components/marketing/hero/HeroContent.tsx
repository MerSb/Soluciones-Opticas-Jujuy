import { Link } from "react-router-dom";
import { WhatsAppButton } from "../../ui/WhatsAppButton";
import { siteContent } from "../../../content/site-content";
import { toTelHref } from "../../../lib/format-phone";
import { buildMapsUrl } from "../../../lib/maps";

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

export function HeroContent() {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium uppercase tracking-wide text-primary [animation:hero-fade-in_0.5s_ease-out_both] [animation-delay:150ms]">
        Óptica en Jujuy
      </p>

      <h1 className="mt-4 text-balance font-display text-5xl leading-[1.05] text-text sm:text-6xl">
        <span className="block overflow-hidden">
          <span className="block [animation:hero-fade-up_0.7s_cubic-bezier(0.16,1,0.3,1)_both] [animation-delay:250ms]">
            Tu visión,
          </span>
        </span>
        <span className="block overflow-hidden">
          <span className="block text-primary [animation:hero-fade-up_0.7s_cubic-bezier(0.16,1,0.3,1)_both] [animation-delay:380ms]">
            nuestra pasión
          </span>
        </span>
      </h1>

      <p className="mt-6 max-w-xl text-lg text-text-muted [animation:hero-fade-up_0.6s_cubic-bezier(0.16,1,0.3,1)_both] [animation-delay:500ms]">
        Anteojos de sol y de receta. Marcas reconocidas. Asesoramiento personalizado.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4 [animation:hero-fade-up_0.6s_cubic-bezier(0.16,1,0.3,1)_both] [animation-delay:620ms]">
        <WhatsAppButton message="Hola, quisiera hacer una consulta.">
          Escribinos por WhatsApp
        </WhatsAppButton>
        <Link
          to="/products"
          className="rounded-md border border-border px-5 py-3 text-sm font-medium text-text transition-[color,border-color,transform] duration-200 hover:-translate-y-px hover:border-primary hover:text-primary"
        >
          Ver anteojos
        </Link>
      </div>

      {(siteContent.address ?? siteContent.phone) && (
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text-muted [animation:hero-fade-in_0.6s_ease-out_both] [animation-delay:750ms]">
          {siteContent.address && (
            <a
              href={buildMapsUrl({ googleMapsUrl: null, address: siteContent.address })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 hover:text-text"
            >
              {PIN_ICON}
              {siteContent.address}
            </a>
          )}
          {siteContent.phone && (
            <a
              href={toTelHref(siteContent.phone)}
              className="inline-flex items-center gap-2 hover:text-text"
            >
              {PHONE_ICON}
              {siteContent.phone}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
