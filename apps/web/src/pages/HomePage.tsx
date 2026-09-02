import { SeoHead } from "../components/ui/SeoHead";
import { Hero } from "../components/marketing/Hero";
import { CTASection } from "../components/marketing/CTASection";
import { BrandRail } from "./home/BrandRail";
import { CategoryDiscoverySection } from "./home/CategoryDiscoverySection";
import { FeaturedProductsSection } from "./home/FeaturedProductsSection";
import { PromotionsSection } from "./home/PromotionsSection";
import { RecommendedForYouSection } from "./home/RecommendedForYouSection";
import { WhyChooseUsSection } from "./home/WhyChooseUsSection";
import { StoreShowcaseSection } from "./home/StoreShowcaseSection";
import { BranchesPreviewSection } from "./home/BranchesPreviewSection";
import { useHealthQuery } from "../services/queries/health";

// Order follows the commercial flow from the Phase A/B continuation
// step's brief: Hero (loudest) -> brands -> category discovery ->
// product preview (second-loudest) -> personalized recommendations
// (authenticated customers only, hidden otherwise) -> promotions
// (hidden while empty) -> why-choose-us -> real storefront
// (institutional trust) -> branches -> contact CTA. Not every section
// is equally loud — see each component's own comments for why.
export function HomePage() {
  return (
    <>
      <SeoHead
        title="Inicio"
        description="Óptica en Jujuy — anteojos recetados, de sol y deportivos. Asesoramiento profesional y atención personalizada."
        canonicalPath="/"
      />
      <Hero />
      {/* Real confirmed brand NAMES (BrandRail, institutional content),
          not the database-backed brand preview this replaced — see
          site-content.ts's confirmedBrands comment for why those are
          deliberately different things right now. The DB-backed
          BrandsPage (/brands, full grid with real product counts)
          still exists and still works; it just isn't previewed here
          anymore in favor of the real names. */}
      <BrandRail />
      <CategoryDiscoverySection />
      <FeaturedProductsSection />
      <RecommendedForYouSection />
      <PromotionsSection />
      <WhyChooseUsSection />
      <StoreShowcaseSection />
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
