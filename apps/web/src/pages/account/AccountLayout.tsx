import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Container } from "../../components/ui/Container";
import { useCurrentUserQuery, useLogoutMutation } from "../../services/queries/auth";

interface AccountNavItem {
  to: string;
  label: string;
}

const NAV_ITEMS: AccountNavItem[] = [
  { to: "/account/profile", label: "Mi perfil" },
  { to: "/account/favorites", label: "Mis favoritos" },
];

// "Mis medidas"/"Mis preferencias" aren't built yet (optical-profile
// phase) — shown as disabled, clearly-labeled future entries rather
// than omitted entirely or, worse, linking nowhere (§29 of the auth
// brief: never a dead control presented as live).
const FUTURE_ITEMS = ["Mis medidas", "Mis preferencias"];

// A consumer account area, not an admin panel (§29) — a simple top nav
// over a narrow content column, not a dense sidebar dashboard.
export function AccountLayout() {
  const { data: user } = useCurrentUserQuery();
  const navigate = useNavigate();
  const logout = useLogoutMutation();

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => navigate("/", { replace: true }),
    });
  }

  return (
    <Container className="py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold text-text">
          {user ? `Hola, ${user.firstName}` : "Mi cuenta"}
        </h1>
        <button
          type="button"
          onClick={handleLogout}
          disabled={logout.isPending}
          className="text-sm font-medium text-text-muted hover:text-primary disabled:opacity-60"
        >
          Cerrar sesión
        </button>
      </div>

      <nav aria-label="Cuenta" className="mt-6 border-b border-border">
        <ul className="flex flex-wrap gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `inline-block border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-text-muted hover:text-text"
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
          {FUTURE_ITEMS.map((label) => (
            <li key={label}>
              <span className="inline-flex cursor-not-allowed items-center gap-1.5 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-text-muted/50">
                {label}
                <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  Próximamente
                </span>
              </span>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8">
        <Outlet />
      </div>
    </Container>
  );
}
