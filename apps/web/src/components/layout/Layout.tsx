import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { AnalyticsConsent } from "./AnalyticsConsent";

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-surface"
      >
        Saltar al contenido principal
      </a>
      <Header />
      {/* min-h-svh: the footer starts below the fold, so loading states
          (lazy route, skeleton grid, short results) never shift it in view. */}
      <main id="main-content" className="min-h-svh flex-1">
        <Outlet />
      </main>
      <Footer />
      <AnalyticsConsent />
    </div>
  );
}
