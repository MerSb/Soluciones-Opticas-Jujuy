import { useEffect } from "react";
import { SITE_NAME, SITE_URL } from "../../lib/seo";

interface SeoHeadProps {
  title: string;
  description?: string;
  canonicalPath?: string;
  /** Absolute image URL (e.g. a Cloudinary delivery URL) for og:image. */
  ogImage?: string;
  /** Private or draft pages: ask search engines not to index them. */
  noIndex?: boolean;
  /** "product" on product pages; "website" otherwise. */
  ogType?: "website" | "product";
  /** Page-specific JSON-LD (built only from real data — see lib/seo.ts). */
  jsonLd?: object | object[];
}

// Client-side head management. Crawlers that run JavaScript (Google)
// read these tags; for the ones that don't, the static public routes
// also get their title/description/canonical baked into their own HTML
// file at build time (see scripts/prerender-heads.ts and ADR-0003).
// Product pages are dynamic and rely on this effect.
export function SeoHead({
  title,
  description,
  canonicalPath,
  ogImage,
  noIndex = false,
  ogType = "website",
  jsonLd,
}: SeoHeadProps) {
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : null;

  useEffect(() => {
    const fullTitle = `${title} · ${SITE_NAME}`;
    document.title = fullTitle;

    function setMeta(selector: string, attribute: string, value: string, content: string) {
      let meta = document.querySelector(selector);
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute(attribute, value);
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content);
    }

    // Every optional tag is removed, not just left stale, when the next
    // page doesn't provide it — otherwise a plain SPA navigation from a
    // page that does (e.g. a product) to one that doesn't would keep
    // describing/previewing the previous page.
    function clearMeta(selector: string) {
      document.querySelector(selector)?.remove();
    }

    if (description) {
      setMeta('meta[name="description"]', "name", "description", description);
      setMeta('meta[property="og:description"]', "property", "og:description", description);
      setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    } else {
      clearMeta('meta[name="description"]');
      clearMeta('meta[property="og:description"]');
      clearMeta('meta[name="twitter:description"]');
    }

    setMeta('meta[property="og:title"]', "property", "og:title", fullTitle);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", fullTitle);
    setMeta('meta[property="og:type"]', "property", "og:type", ogType);
    setMeta('meta[property="og:site_name"]', "property", "og:site_name", SITE_NAME);
    setMeta('meta[property="og:locale"]', "property", "og:locale", "es_AR");
    if (ogImage) {
      setMeta('meta[property="og:image"]', "property", "og:image", ogImage);
      setMeta('meta[name="twitter:image"]', "name", "twitter:image", ogImage);
      setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    } else {
      clearMeta('meta[property="og:image"]');
      clearMeta('meta[name="twitter:image"]');
      setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary");
    }

    if (noIndex) {
      setMeta('meta[name="robots"]', "name", "robots", "noindex, nofollow");
    } else {
      clearMeta('meta[name="robots"]');
    }

    if (canonicalPath) {
      // Always the public domain, never the host the page was opened on
      // (the vercel.app alias or a preview must point back to it).
      const absoluteUrl = new URL(canonicalPath, SITE_URL).toString();
      let link = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", absoluteUrl);
      setMeta('meta[property="og:url"]', "property", "og:url", absoluteUrl);
    } else {
      document.querySelector('link[rel="canonical"]')?.remove();
      clearMeta('meta[property="og:url"]');
    }

    document.querySelector('script[data-seo="page"]')?.remove();
    if (jsonLdText) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.seo = "page";
      script.textContent = jsonLdText;
      document.head.appendChild(script);
    }
  }, [title, description, canonicalPath, ogImage, noIndex, ogType, jsonLdText]);

  return null;
}
