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
      <p className="text-sm font-semibold uppercase tracking-wide text-primary [animation:hero-fade-in_0.5s_ease-out_both] [animation-delay:150ms]">
        Óptica en Jujuy
      </p>

      {/* text-hero: a fluid clamp() token (global.css), not a
          breakpoint ladder — ~44px on narrow mobile up to the brief's
          80–120px desktop target, scaling continuously instead of
          jumping at specific widths. font-extrabold (800) is Manrope
          Variable's actual maximum registered weight — requesting 900
          here would just get silently clamped to 800 by the browser
          (a variable font's `font-weight` axis has a real registered
          range; the UA snaps an out-of-range request to its nearest
          bound rather than synthesizing a heavier weight), so this
          asks for exactly what's deliverable. */}
      <h1 className="mt-4 text-balance font-display text-hero font-extrabold leading-[1.05] text-text">
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
          className="group inline-flex items-center gap-2 rounded-md border border-border bg-transparent px-5 py-3 text-sm font-semibold text-text transition-colors duration-200 hover:border-primary hover:bg-primary/5 hover:text-primary"
        >
          Ver anteojos
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
          >
            <path
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 8h10M9 4l4 4-4 4"
            />
          </svg>
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
