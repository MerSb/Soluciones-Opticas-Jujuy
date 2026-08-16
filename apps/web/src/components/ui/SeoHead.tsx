import { useEffect } from "react";

interface SeoHeadProps {
  title: string;
  description?: string;
  canonicalPath?: string;
}

// Placeholder, not a solution: sets document.title/meta/canonical via a
// client-side effect, which does nothing for a crawler that doesn't run
// JS (the actual SEO/OG problem — see ADR-0003). It exists so every page
// already declares its title/description/canonical in ONE place now,
// ready for whichever prerendering tool implements ADR-0003. That step
// will very likely replace this with a real head-management library
// (react-helmet-async, unhead — not decided; the right choice depends on
// the specific SSG tool picked, which isn't built yet). Not solving SEO
// today — just not leaving every page to invent its own ad hoc approach
// in the meantime.
export function SeoHead({ title, description, canonicalPath }: SeoHeadProps) {
  useEffect(() => {
    document.title = `${title} · Soluciones Ópticas`;

    if (description) {
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "description");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", description);
    }

    if (canonicalPath) {
      let link = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", new URL(canonicalPath, window.location.origin).toString());
    }
  }, [title, description, canonicalPath]);

  return null;
}
