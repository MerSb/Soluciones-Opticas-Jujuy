import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useCurrentUserQuery } from "../../services/queries/auth";
import { Container } from "../ui/Container";
import { StatusMessage } from "../ui/StatusMessage";

// Gates every /admin/* route. Three distinct outcomes, deliberately not
// collapsed into two: not authenticated → /login (same as
// ProtectedRoute); authenticated but not ADMIN → a real 403 experience,
// in place, not a redirect (a customer hitting /admin should understand
// *why* they can't be here, not silently bounce to their own account);
// authenticated ADMIN → render. `isLoading` covers the same "auth/me
// hasn't resolved yet" window ProtectedRoute already handles — nothing
// here ever flashes admin content before the role check resolves.
export function AdminRoute() {
  const { data: user, isLoading, isError } = useCurrentUserQuery();
  const location = useLocation();

  if (isLoading) {
    return (
      <Container className="py-16">
        <StatusMessage variant="loading" message="Cargando…" />
      </Container>
    );
  }

  if (isError || !user) {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }

  if (user.role !== "ADMIN") {
    return (
      <Container className="py-16">
        <StatusMessage
          variant="error"
          heading="Acceso restringido"
          message="Esta sección es solo para el equipo de Soluciones Ópticas. Si creés que esto es un error, contactá a un administrador."
        />
      </Container>
    );
  }

  return <Outlet />;
}
