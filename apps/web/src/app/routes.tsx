import type { RouteObject } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { HomePage } from "../pages/HomePage";
import { BrandsPage } from "../pages/BrandsPage";
import { AboutPage } from "../pages/AboutPage";
import { BranchesPage } from "../pages/BranchesPage";
import { ContactPage } from "../pages/ContactPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { Container } from "../components/ui/Container";
import { StatusMessage } from "../components/ui/StatusMessage";

// Shown while a lazy route's chunk is still downloading. Also silences
// React Router's "No HydrateFallback element provided" warning, which
// otherwise fires on first paint for any route using `lazy`.
function RouteLoadingFallback() {
  return (
    <Container className="py-16">
      <StatusMessage variant="loading" message="Cargando página…" />
    </Container>
  );
}

// Route data, separate from the browser-specific router instance
// (./router.tsx) — lets tests build a createMemoryRouter from the exact
// same tree instead of duplicating it.
//
// /products and /products/:slug are lazy-loaded: they're the routes that
// will carry real weight once the catalog UI exists (images, filters,
// grids) — worth paying the code-splitting setup cost now, before they
// grow, rather than refactoring later. Everything else here is a small,
// near-universal shell with nothing to gain from a second network
// round-trip.
export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: "products",
        HydrateFallback: RouteLoadingFallback,
        lazy: async () => {
          const { ProductsPage } = await import("../pages/ProductsPage");
          return { Component: ProductsPage };
        },
      },
      {
        path: "products/:slug",
        HydrateFallback: RouteLoadingFallback,
        lazy: async () => {
          const { ProductDetailPage } = await import("../pages/ProductDetailPage");
          return { Component: ProductDetailPage };
        },
      },
      { path: "brands", element: <BrandsPage /> },
      { path: "about", element: <AboutPage /> },
      { path: "branches", element: <BranchesPage /> },
      { path: "contact", element: <ContactPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
