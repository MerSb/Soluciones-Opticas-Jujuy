import { Link } from "react-router-dom";
import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";
import { StatusMessage } from "../components/ui/StatusMessage";

export function NotFoundPage() {
  return (
    <>
      <SeoHead title="Página no encontrada" />
      <Container className="py-16">
        <StatusMessage
          variant="not-found"
          heading="Página no encontrada"
          message="La página que buscás no existe o fue movida."
          action={
            <Link
              to="/"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
            >
              Volver al inicio
            </Link>
          }
        />
      </Container>
    </>
  );
}
