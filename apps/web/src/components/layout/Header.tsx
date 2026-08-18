import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { WhatsAppButton } from "../ui/WhatsAppButton";
import { ThemeSwitcher } from "./ThemeSwitcher";

interface NavItem {
  to: string;
  label: string;
  /** Exact-pathname match only (like NavLink's `end`) — otherwise a pathname-prefix match. */
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Inicio", end: true },
  { to: "/products", label: "Anteojos" },
  { to: "/products?category=promociones", label: "Promociones" },
  { to: "/brands", label: "Marcas" },
  { to: "/about", label: "Nosotros" },
  { to: "/branches", label: "Sucursales" },
  { to: "/contact", label: "Contacto" },
];

// Plain <Link>, not <NavLink> — NavLink's own `isActive` ignores the
// query string in `to` entirely (it only ever compares pathnames), so
// "Anteojos" (/products) and "Promociones" (/products?category=
// promociones) both matched "active" on *any* /products URL regardless
// of the actual category filter, including plain /products with no
// filter at all (a real bug this step's live nav-state check caught,
// not a hypothetical). This computes active state itself: an item whose
// `to` carries a query string only counts as active when the current
// URL's search matches it exactly; a plain item (no query in `to`)
// still matches on pathname alone, same as before — so "Anteojos"
// staying lit up while specifically viewing the Promociones filter is
// still expected (a real subset of "Anteojos"), it just no longer runs
// in reverse.
function isNavItemActive(item: NavItem, pathname: string, search: string): boolean {
  const [itemPath, itemSearch] = item.to.split("?");
  const pathMatches = item.end ? pathname === itemPath : pathname.startsWith(itemPath!);
  if (!pathMatches) return false;
  if (itemSearch) return search === `?${itemSearch}`;
  return true;
}

// The underline is a ::after pseudo-element scaled from 0, not a
// layout-affecting border, so hover/active never shifts surrounding
// text (§16 — "do not animate text position").
function navLinkClassName(isActive: boolean): string {
  return `relative py-1 text-sm font-semibold text-text-muted transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-200 hover:text-text hover:after:scale-x-100 ${
    isActive ? "text-primary after:scale-x-100" : ""
  }`;
}

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="whitespace-nowrap font-display text-lg font-bold text-text lg:text-xl"
          aria-label="Soluciones Ópticas — Inicio"
        >
          Soluciones Ópticas
        </Link>

        {/* lg:, not md: — with "Promociones" and the theme switcher
            added, 7 nav items plus the logo don't fit until 1024px;
            tablet portrait (768–1023px) now gets the hamburger menu
            instead of a squeezed inline nav, the same pattern phones
            already used (confirmed live — see the header wrap fix
            history in FRONTEND_ARCHITECTURE.md). */}
        <nav aria-label="Principal" className="hidden lg:block">
          <ul className="flex gap-5 xl:gap-7">
            {NAV_ITEMS.map((item) => {
              const isActive = isNavItemActive(item, location.pathname, location.search);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={isActive ? "page" : undefined}
                    className={navLinkClassName(isActive)}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeSwitcher />

          {/* Doubles as the "WhatsApp icon/action" and the "Escribinos"
              CTA the brief lists separately — WhatsAppButton already
              renders both the icon and the label together, so a second
              icon-only WhatsApp link next to it would just point at the
              same destination twice.

              xl:, not lg: — adding "Promociones" and the theme switcher
              cuts into the width budget the lg: CTA relied on before
              (same class of issue as the earlier 768px wrap bug), so
              this waits one breakpoint further pending a live width
              check; WhatsApp stays reachable via the Hero's own CTA in
              the meantime. */}
          <div className="hidden xl:block">
            <WhatsAppButton message="Hola, quisiera hacer una consulta.">Escribinos</WhatsAppButton>
          </div>

          <button
            type="button"
            className="rounded-md p-2 text-text lg:hidden"
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
          className="border-t border-border lg:hidden [animation:hero-fade-up_0.25s_ease-out_both]"
        >
          <ul className="flex flex-col gap-1 px-4 py-4">
            {NAV_ITEMS.map((item) => {
              const isActive = isNavItemActive(item, location.pathname, location.search);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setIsMenuOpen(false)}
                    className={`block rounded-md px-3 py-2 text-base ${
                      isActive ? "bg-surface-muted text-primary" : "text-text"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
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
