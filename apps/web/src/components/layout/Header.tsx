import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { WhatsAppButton } from "../ui/WhatsAppButton";

const NAV_ITEMS = [
  { to: "/", label: "Inicio", end: true },
  { to: "/products", label: "Anteojos" },
  { to: "/brands", label: "Marcas" },
  { to: "/about", label: "Nosotros" },
  { to: "/branches", label: "Sucursales" },
  { to: "/contact", label: "Contacto" },
];

// NavLink sets aria-current="page" on the active link automatically —
// no manual ARIA needed for that part. The underline is a ::after
// pseudo-element scaled from 0, not a layout-affecting border, so
// hover/active never shifts surrounding text (§16 — "do not animate
// text position").
function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return `relative py-1 text-sm font-medium text-text-muted transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-200 hover:text-text hover:after:scale-x-100 ${
    isActive ? "text-primary after:scale-x-100" : ""
  }`;
}

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="font-display text-xl font-semibold text-text"
          aria-label="Soluciones Ópticas — Inicio"
        >
          Soluciones Ópticas
        </Link>

        <nav aria-label="Principal" className="hidden md:block">
          <ul className="flex gap-5 lg:gap-8">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className={navLinkClassName}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-4">
          {/* Doubles as the "WhatsApp icon/action" and the "Escribinos"
              CTA the brief lists separately — WhatsAppButton already
              renders both the icon and the label together, so a second
              icon-only WhatsApp link next to it would just point at the
              same destination twice.

              lg:, not md:: at exactly 768px (tablet portrait), the full
              6-item nav plus this CTA plus the logo don't fit in one
              row (confirmed live — it wrapped the header to two lines),
              so the CTA waits for the wider lg breakpoint; tablet
              portrait still gets the full nav, just without this
              button (WhatsApp stays reachable via the Hero's own CTA). */}
          <div className="hidden lg:block">
            <WhatsAppButton message="Hola, quisiera hacer una consulta.">Escribinos</WhatsAppButton>
          </div>

          <button
            type="button"
            className="rounded-md p-2 text-text md:hidden"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <span className="sr-only">{isMenuOpen ? "Cerrar menú" : "Abrir menú"}</span>
            {isMenuOpen ? (
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Principal"
          className="border-t border-border md:hidden [animation:hero-fade-up_0.25s_ease-out_both]"
        >
          <ul className="flex flex-col gap-1 px-4 py-4">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => setIsMenuOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-2 text-base ${
                      isActive ? "bg-surface-muted text-primary" : "text-text"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li className="mt-2">
              <WhatsAppButton message="Hola, quisiera hacer una consulta.">
                Escribinos
              </WhatsAppButton>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
