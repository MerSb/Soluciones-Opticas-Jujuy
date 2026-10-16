import { SeoHead } from "./SeoHead";
import { STATIC_ROUTE_SEO, type RouteSeo } from "../../lib/seo-routes";

// A public static route's head tags, from the same entry the build uses
// to pre-render that route's HTML (scripts/prerender-heads.ts), so the
// raw HTML and the running app always agree.
export function StaticRouteSeo({
  route,
  jsonLd,
}: {
  route: keyof typeof STATIC_ROUTE_SEO;
  jsonLd?: object | object[];
}) {
  const seo: RouteSeo = STATIC_ROUTE_SEO[route];
  return (
    <SeoHead
      title={seo.title}
      description={seo.description}
      canonicalPath={seo.path}
      noIndex={seo.noIndex}
      jsonLd={jsonLd}
    />
  );
}
