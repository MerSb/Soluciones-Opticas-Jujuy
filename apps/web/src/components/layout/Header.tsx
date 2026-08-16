import { useState } from "react";
import { Link, NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/products", label: "Productos" },
  { to: "/brands", label: "Marcas" },
  { to: "/about", label: "Nosotros" },
  { to: "/branches", label: "Sucursales" },
  { to: "/contact", label: "Contacto" },
];

// NavLink sets aria-current="page" on the active link automatically —
// no manual ARIA needed for that part.
function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return `text-sm font-medium transition-colors ${
    isActive ? "text-primary" : "text-text-muted hover:text-text"
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
          <ul className="flex gap-8">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={navLinkClassName}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

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

      {isMenuOpen && (
        <nav id="mobile-nav" aria-label="Principal" className="border-t border-border md:hidden">
          <ul className="flex flex-col gap-1 px-4 py-4">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
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
          </ul>
        </nav>
      )}
    </header>
  );
}
