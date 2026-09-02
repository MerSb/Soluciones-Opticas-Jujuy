import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useCurrentUserQuery } from "../../services/queries/auth";
import { Container } from "../ui/Container";
import { StatusMessage } from "../ui/StatusMessage";

// Gates every /account/* route. isLoading: the very first render before
// auth/me has resolved (either genuinely logged in, or a 401 that's
// already tried a silent refresh — see api-client.ts) — a brief loading
// state here beats flashing the login page for someone who actually has
// a valid session, or flashing protected content for someone who
// doesn't.
export function ProtectedRoute() {
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

  return <Outlet />;
}
