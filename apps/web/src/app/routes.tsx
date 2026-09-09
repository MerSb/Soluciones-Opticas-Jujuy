import { Navigate, type RouteObject } from "react-router-dom";
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
      { path: "brands", element: <BrandsPage /> },
      { path: "about", element: <AboutPage /> },
      { path: "branches", element: <BranchesPage /> },
      { path: "contact", element: <ContactPage /> },
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
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
