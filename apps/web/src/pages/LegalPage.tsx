import { Fragment } from "react";
import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";
import type { LegalDocument } from "../content/legal/types";
import { AnalyticsPreference } from "../components/layout/AnalyticsConsent";

// Aviso legal / privacidad / cookies. While a document isn't approved
// (content/legal/status.ts) it is only reachable in `npm run dev`; there
// the banner says it is a draft, every missing fact shows as a visible
// "Pendiente" marker and the page asks not to be indexed.

const PENDING = /\[\[PENDIENTE: ([^\]]+)\]\]/g;

function withPending(text: string) {
  const parts: (string | { pending: string })[] = [];
  let last = 0;
  for (const match of text.matchAll(PENDING)) {
    parts.push(text.slice(last, match.index));
    parts.push({ pending: match[1]! });
    last = match.index! + match[0].length;
  }
  parts.push(text.slice(last));
  return parts.map((part, index) =>
    typeof part === "string" ? (
      <Fragment key={index}>{part}</Fragment>
    ) : (
      <mark
        key={index}
        className="rounded bg-amber-100 px-1.5 py-0.5 text-sm font-semibold text-amber-900 dark:bg-amber-400/20 dark:text-amber-200"
      >
        Pendiente: {part.pending}
      </mark>
    ),
  );
}

export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <>
      <SeoHead
        title={document.title}
        description={document.description}
        canonicalPath={`/${document.slug}`}
        noIndex={!document.approved}
      />
      <Container className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-semibold text-text sm:text-4xl">
            {document.title}
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            {document.approved ? "Última actualización" : "Última edición del borrador"}:{" "}
            {document.updated}
          </p>
          {!document.approved && (
            <p
              role="note"
              className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100"
            >
              Borrador pendiente de revisión legal. Describe el funcionamiento actual del sitio; los
              datos marcados como «Pendiente» todavía no fueron provistos.
            </p>
          )}

          <nav aria-label="Contenido" className="mt-8 rounded-md border border-border p-4">
            <p className="text-sm font-semibold text-text">Contenido</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              {document.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {document.sections.map((section) => (
            <section key={section.id} id={section.id} className="mt-10 scroll-mt-24">
              <h2 className="font-display text-xl font-semibold text-text">{section.title}</h2>
              {section.paragraphs.map((paragraph, index) => (
                <p key={index} className="mt-3 leading-relaxed text-text-muted">
                  {withPending(paragraph)}
                </p>
              ))}
              {section.items && (
                <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-text-muted">
                  {section.items.map((item, index) => (
                    <li key={index}>{withPending(item)}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {document.slug === "cookies" && <AnalyticsPreference />}
        </div>
      </Container>
    </>
  );
}
