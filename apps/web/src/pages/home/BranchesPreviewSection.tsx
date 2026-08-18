import { Link } from "react-router-dom";
import { Container } from "../../components/ui/Container";
import { SectionHeading } from "../../components/marketing/SectionHeading";
import { BranchCard } from "../../components/branches/BranchCard";
import { useBranchesQuery } from "../../services/queries/branches";

export function BranchesPreviewSection() {
  const { data: branches, isLoading, isError } = useBranchesQuery();

  if (isLoading || isError || !branches || branches.length === 0) return null;

  return (
    <section className="py-16">
      <Container>
        <SectionHeading eyebrow="Sucursales" title="Encontrá tu sucursal" />
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {branches.slice(0, 2).map((branch) => (
            <BranchCard key={branch.name} branch={branch} />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/branches" className="text-sm font-medium text-primary hover:underline">
            Ver todas las sucursales →
          </Link>
        </div>
      </Container>
    </section>
  );
}
