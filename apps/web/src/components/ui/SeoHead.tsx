import { useEffect } from "react";

interface SeoHeadProps {
  title: string;
  description?: string;
  canonicalPath?: string;
  /** Absolute image URL (e.g. a Cloudinary delivery URL) for og:image. */
  ogImage?: string;
}

// Placeholder, not a solution: sets document.title/meta/canonical (and,
// as of Customer Experience V2, Open Graph tags) via a client-side
// effect, which does nothing for a crawler that doesn't run JS (the
// actual SEO/OG problem — see ADR-0003). It exists so every page
// already declares its title/description/canonical/OG data in ONE
// place now, ready for whichever prerendering tool implements ADR-0003.
// That step will very likely replace this with a real head-management
// library (react-helmet-async, unhead — not decided; the right choice
// depends on the specific SSG tool picked, which isn't built yet).
//
// IMPORTANT, still true after this change: this only ever improves
// metadata for a browser that actually executes JS. It does NOT
// produce a correct preview when a JS-less crawler (most link-unfurl
// bots, some search crawlers) fetches the raw HTML — that bot sees the
// SPA shell, not this effect's output. Prerender/SSR remains a
// separate, not-yet-scheduled milestone (ADR-0003); nothing here
// claims to solve it.
export function SeoHead({ title, description, canonicalPath, ogImage }: SeoHeadProps) {
  useEffect(() => {
    const fullTitle = `${title} · Soluciones Ópticas`;
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

    if (description) {
      setMeta('meta[name="description"]', "name", "description", description);
      setMeta('meta[property="og:description"]', "property", "og:description", description);
    }

    setMeta('meta[property="og:title"]', "property", "og:title", fullTitle);
    setMeta('meta[property="og:type"]', "property", "og:type", "website");
    if (ogImage) {
      setMeta('meta[property="og:image"]', "property", "og:image", ogImage);
    }

    if (canonicalPath) {
      const absoluteUrl = new URL(canonicalPath, window.location.origin).toString();

      let link = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", absoluteUrl);

      setMeta('meta[property="og:url"]', "property", "og:url", absoluteUrl);
    }
  }, [title, description, canonicalPath, ogImage]);

  return null;
}
