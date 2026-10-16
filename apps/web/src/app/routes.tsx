import { Navigate, type RouteObject } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { HomePage } from "../pages/HomePage";
import { BrandsPage } from "../pages/BrandsPage";
import { AboutPage } from "../pages/AboutPage";
import { BranchesPage } from "../pages/BranchesPage";
import { ContactPage } from "../pages/ContactPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import type { LegalDocument } from "../content/legal/types";
import {
  COOKIE_POLICY_APPROVED,
  LEGAL_NOTICE_APPROVED,
  PRIVACY_POLICY_APPROVED,
} from "../content/legal/status";
import { SHOW_LEGAL_DRAFTS } from "../content/legal/visibility";
import { Container } from "../components/ui/Container";
import { StatusMessage } from "../components/ui/StatusMessage";

// Shown while a lazy route's chunk is still downloading. Also silences
// React Router's "No HydrateFallback element provided" warning, which
// otherwise fires on first paint for any route using `lazy`.
function RouteLoadingFallback() {
  return (
    // min-h: keeps the footer below the fold while a lazy route loads, so
    // it doesn't jump down when the page arrives (CLS).
    <Container className="min-h-[70vh] py-16">
      <StatusMessage variant="loading" message="Cargando página…" />
    </Container>
  );
}

// A legal page (aviso legal, privacidad, cookies) is a route only once it
// is approved (content/legal/status.ts), or in `npm run dev` to review
// the draft. Both conditions are build-time constants, so a production
// build drops an unapproved page — route, component and draft text — and
// its URL gets Vercel's real 404.
function legalRoute(path: string, load: () => Promise<{ default: LegalDocument }>): RouteObject {
  return {
    path,
    HydrateFallback: RouteLoadingFallback,
    lazy: async () => {
      const [{ LegalPage }, { default: document }] = await Promise.all([
        import("../pages/LegalPage"),
        load(),
      ]);
      return { Component: () => <LegalPage document={document} /> };
    },
  };
}

// Route data, separate from the browser-specific router instance
// (./router.tsx) — lets tests build a createMemoryRouter from the exact
// same tree instead of duplicating it.
//
// /products, /products/:slug, /login, /register, and /account/* are all
// lazy-loaded: either they carry real weight (catalog images/filters/
// grids) or only a subset of visitors ever reaches them (auth/account),
// so neither should cost the public-browsing majority anything in the
// initial bundle. Everything else here is a small, near-universal shell
// with nothing to gain from a second network round-trip.
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
      {
        path: "accesorios",
        HydrateFallback: RouteLoadingFallback,
        lazy: async () => {
          const { AccessoriesPage } = await import("../pages/AccessoriesPage");
          return { Component: AccessoriesPage };
        },
      },
      {
        // ADR-0028: same page as products/:slug — the URL keeps the header
        // on "Accesorios" and matches the breadcrumb.
        path: "accesorios/:slug",
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
      ...(SHOW_LEGAL_DRAFTS || LEGAL_NOTICE_APPROVED
        ? [legalRoute("aviso-legal", () => import("../content/legal/legal-notice"))]
        : []),
      ...(SHOW_LEGAL_DRAFTS || PRIVACY_POLICY_APPROVED
        ? [legalRoute("privacidad", () => import("../content/legal/privacy-policy"))]
        : []),
      ...(SHOW_LEGAL_DRAFTS || COOKIE_POLICY_APPROVED
        ? [legalRoute("cookies", () => import("../content/legal/cookie-policy"))]
        : []),
      // login/register/account: lazy, same reasoning as products — only
      // a subset of visitors ever reach them, so the public catalog
      // majority shouldn't pay for this code in their initial bundle
      // (§55 of the auth brief).
      {
        path: "login",
        HydrateFallback: RouteLoadingFallback,
        lazy: async () => {
          const { LoginPage } = await import("../pages/auth/LoginPage");
          return { Component: LoginPage };
        },
      },
      {
        path: "register",
        HydrateFallback: RouteLoadingFallback,
        lazy: async () => {
          const { RegisterPage } = await import("../pages/auth/RegisterPage");
          return { Component: RegisterPage };
        },
      },
      {
        path: "account",
        HydrateFallback: RouteLoadingFallback,
        lazy: async () => {
          const { ProtectedRoute } = await import("../components/auth/ProtectedRoute");
          return { Component: ProtectedRoute };
        },
        children: [
          {
            lazy: async () => {
              const { AccountLayout } = await import("../pages/account/AccountLayout");
              return { Component: AccountLayout };
            },
            children: [
              { index: true, element: <Navigate to="/account/profile" replace /> },
              {
                path: "profile",
                lazy: async () => {
                  const { ProfilePage } = await import("../pages/account/ProfilePage");
                  return { Component: ProfilePage };
                },
              },
              {
                path: "favorites",
                lazy: async () => {
                  const { FavoritesPage } = await import("../pages/account/FavoritesPage");
                  return { Component: FavoritesPage };
                },
              },
              {
                path: "optical-profile",
                lazy: async () => {
                  const { OpticalProfilePage } =
                    await import("../pages/account/OpticalProfilePage");
                  return { Component: OpticalProfilePage };
                },
              },
              {
                path: "recommendations",
                lazy: async () => {
                  const { RecommendationsPage } =
                    await import("../pages/account/RecommendationsPage");
                  return { Component: RecommendationsPage };
                },
              },
            ],
          },
        ],
      },
      {
        path: "admin",
        HydrateFallback: RouteLoadingFallback,
        lazy: async () => {
          const { AdminRoute } = await import("../components/auth/AdminRoute");
          return { Component: AdminRoute };
        },
        children: [
          {
            lazy: async () => {
              const { AdminLayout } = await import("../pages/admin/AdminLayout");
              return { Component: AdminLayout };
            },
            children: [
              {
                index: true,
                lazy: async () => {
                  const { AdminDashboardPage } = await import("../pages/admin/AdminDashboardPage");
                  return { Component: AdminDashboardPage };
                },
              },
              {
                path: "products",
                lazy: async () => {
                  const { AdminProductsPage } = await import("../pages/admin/AdminProductsPage");
                  return { Component: AdminProductsPage };
                },
              },
              {
                path: "products/new",
                lazy: async () => {
                  const { AdminNewProductPage } =
                    await import("../pages/admin/AdminNewProductPage");
                  return { Component: AdminNewProductPage };
                },
              },
              {
                path: "products/:id",
                lazy: async () => {
                  const { AdminProductDetailPage } =
                    await import("../pages/admin/AdminProductDetailPage");
                  return { Component: AdminProductDetailPage };
                },
              },
              {
                path: "brands",
                lazy: async () => {
                  const { AdminBrandsPage } = await import("../pages/admin/AdminBrandsPage");
                  return { Component: AdminBrandsPage };
                },
              },
              {
                path: "categories",
                lazy: async () => {
                  const { AdminCategoriesPage } =
                    await import("../pages/admin/AdminCategoriesPage");
                  return { Component: AdminCategoriesPage };
                },
              },
              {
                path: "lens-types",
                lazy: async () => {
                  const { AdminLensTypesPage } = await import("../pages/admin/AdminLensTypesPage");
                  return { Component: AdminLensTypesPage };
                },
              },
              {
                path: "lens-types/:id",
                lazy: async () => {
                  const { AdminLensTypeDetailPage } =
                    await import("../pages/admin/AdminLensTypeDetailPage");
                  return { Component: AdminLensTypeDetailPage };
                },
              },
              {
                path: "lens-treatments",
                lazy: async () => {
                  const { AdminLensTreatmentsPage } =
                    await import("../pages/admin/AdminLensTreatmentsPage");
                  return { Component: AdminLensTreatmentsPage };
                },
              },
              {
                path: "shipping",
                lazy: async () => {
                  const { AdminShippingPage } = await import("../pages/admin/AdminShippingPage");
                  return { Component: AdminShippingPage };
                },
              },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
