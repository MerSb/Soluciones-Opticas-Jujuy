import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/marketing/SectionHeading";
import { StatusMessage } from "../components/ui/StatusMessage";
import { BranchCard } from "../components/branches/BranchCard";
import { useBranchesQuery } from "../services/queries/branches";

export function BranchesPage() {
  const { data: branches, isLoading, isError } = useBranchesQuery();

  return (
    <>
      <SeoHead
        title="Sucursales"
        description="Encontrá tu sucursal más cercana, horarios y formas de contacto."
        canonicalPath="/branches"
      />
      <Container className="py-16">
        <SectionHeading eyebrow="Sucursales" title="Encontrá tu sucursal" />
        <div className="mt-10">
          {isLoading && <StatusMessage variant="loading" message="Cargando sucursales…" />}
          {isError && (
            <StatusMessage
              variant="error"
              message="No pudimos cargar las sucursales. Probá de nuevo más tarde."
            />
          )}
          {!isLoading && !isError && branches && branches.length === 0 && (
            <StatusMessage variant="empty" message="Todavía no hay sucursales cargadas." />
          )}
          {branches && branches.length > 0 && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {branches.map((branch) => (
                <BranchCard key={branch.name} branch={branch} />
              ))}
            </div>
          )}
        </div>
      </Container>
    </>
  );
}
