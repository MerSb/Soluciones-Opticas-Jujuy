import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Container } from "../../components/ui/Container";
import { useCurrentUserQuery, useLogoutMutation } from "../../services/queries/auth";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/products", label: "Productos" },
  { to: "/admin/brands", label: "Marcas" },
  { to: "/admin/categories", label: "Categorías" },
  { to: "/admin/lens-types", label: "Cristales" },
  { to: "/admin/lens-treatments", label: "Tratamientos" },
];

// Same top-nav-over-content shell as AccountLayout — no dense sidebar
// dashboard was ever asked for, and there are only three resources to
// manage in this phase (Products, Brands, Categories).
export function AdminLayout() {
  const { data: user } = useCurrentUserQuery();
  const navigate = useNavigate();
  const logout = useLogoutMutation();

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate("/", { replace: true }) });
  }

  return (
    <Container className="py-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Panel de administración</h1>
          {user && <p className="mt-1 text-sm text-text-muted">Conectado como {user.email}</p>}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={logout.isPending}
          className="text-sm font-medium text-text-muted hover:text-primary disabled:opacity-60"
        >
          Cerrar sesión
        </button>
      </div>

      <nav aria-label="Administración" className="mt-6 border-b border-border">
        <ul className="flex flex-wrap gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
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
        </ul>
      </nav>

      <div className="mt-8">
        <Outlet />
      </div>
    </Container>
  );
}
