// Shared by the app (SeoHead/lib/seo.ts) and the build (vite.config.ts →
// scripts/prerender-heads.ts). Plain data, no browser or env access, so
// Node can import it at build time.

export const SITE_NAME = "Soluciones Ópticas";
export const SITE_URL = "https://www.solucionesopticas.com.ar";

export interface RouteSeo {
  path: string;
  title: string;
  description: string;
  /** Drafts and private pages: present but not indexed. */
  noIndex?: boolean;
  /** Listed in the sitemap. */
  inSitemap: boolean;
}

/**
 * Public, static routes. Each gets its own pre-built HTML file with
 * these tags in <head>, so a crawler that doesn't run JavaScript still
 * reads the right title, description and canonical. The pages read the
 * same entries, so both stay in sync.
 */
export const STATIC_ROUTE_SEO = {
  home: {
    path: "/",
    title: "Óptica en San Salvador de Jujuy",
    description:
      "Óptica en Jujuy — anteojos recetados, de sol y deportivos. Asesoramiento profesional y atención personalizada.",
    inSitemap: true,
  },
  products: {
    path: "/products",
    title: "Anteojos",
    description:
      "Explorá el catálogo de anteojos recetados, de sol y deportivos de Soluciones Ópticas.",
    inSitemap: true,
  },
  accessories: {
    path: "/accesorios",
    title: "Accesorios",
    description:
      "Limpiacristales, estuches y más accesorios para cuidar tus anteojos en Soluciones Ópticas, Jujuy.",
    inSitemap: true,
  },
  brands: {
    path: "/brands",
    title: "Marcas",
    description: "Las marcas de anteojos que trabajamos en Soluciones Ópticas.",
    inSitemap: true,
  },
  about: {
    path: "/about",
    title: "Nosotros",
    description: "Conocé la historia, la misión y los valores de Soluciones Ópticas.",
    inSitemap: true,
  },
  branches: {
    path: "/branches",
    title: "Sucursales",
    description: "Dirección, teléfono y WhatsApp de Soluciones Ópticas en San Salvador de Jujuy.",
    inSitemap: true,
  },
  contact: {
    path: "/contact",
    title: "Contacto",
    description:
      "Escribinos por WhatsApp, llamanos o visitanos en Alvear 732, San Salvador de Jujuy.",
    inSitemap: true,
  },
  legalNotice: {
    path: "/aviso-legal",
    title: "Aviso legal",
    description: "Quién es responsable de este sitio, para qué existe y las condiciones de uso.",
    noIndex: true,
    inSitemap: false,
  },
  privacy: {
    path: "/privacidad",
    title: "Política de privacidad",
    description:
      "Qué datos personales trata Soluciones Ópticas en este sitio, para qué y cómo ejercer tus derechos.",
    noIndex: true,
    inSitemap: false,
  },
  cookies: {
    path: "/cookies",
    title: "Política de cookies",
    description: "Qué cookies y almacenamiento usa el sitio de Soluciones Ópticas y para qué.",
    noIndex: true,
    inSitemap: false,
  },
} satisfies Record<string, RouteSeo>;
