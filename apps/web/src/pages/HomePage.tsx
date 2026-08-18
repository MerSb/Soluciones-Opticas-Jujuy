import { SeoHead } from "../components/ui/SeoHead";
import { Hero } from "../components/marketing/Hero";
import { CTASection } from "../components/marketing/CTASection";
import { CategoryDiscoverySection } from "./home/CategoryDiscoverySection";
import { BrandsPreviewSection } from "./home/BrandsPreviewSection";
import { WhyChooseUsSection } from "./home/WhyChooseUsSection";
import { BranchesPreviewSection } from "./home/BranchesPreviewSection";
import { useHealthQuery } from "../services/queries/health";

export function HomePage() {
  return (
    <>
      <SeoHead
        title="Inicio"
        description="Óptica en Jujuy — anteojos recetados, de sol y deportivos. Asesoramiento profesional y atención personalizada."
        canonicalPath="/"
      />
      <Hero />
      <CategoryDiscoverySection />
      <BrandsPreviewSection />
      <WhyChooseUsSection />
      <BranchesPreviewSection />
      <CTASection />
      <DevConnectivityCheck />
    </>
  );
}

// Dev-only (import.meta.env.DEV is statically stripped from production
// builds) — a live, honest check that the frontend can reach the API,
// without shipping a debug widget to the real homepage. See §21.
function DevConnectivityCheck() {
  const { data, isLoading, isError } = useHealthQuery();

  if (!import.meta.env.DEV) return null;

  return (
    <p className="px-4 py-4 text-center text-xs text-text-muted">
      API: {isLoading ? "verificando…" : isError ? "sin conexión" : (data?.status ?? "desconocido")}
    </p>
  );
}
