import { Container } from "../../components/ui/Container";
import { SectionHeading } from "../../components/marketing/SectionHeading";
import { siteContent } from "../../content/site-content";

// Static — no API call, no query needed. Content lives in
// siteContent.strengths (neutral, non-specific claims only).
export function WhyChooseUsSection() {
  return (
    <section className="py-16">
      <Container>
        <SectionHeading eyebrow="Por qué elegirnos" title="Pensado para vos" align="center" />
        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
          {siteContent.strengths.map((strength) => (
            <div key={strength.title} className="rounded-lg border border-border bg-surface p-6">
              <h3 className="font-display text-lg text-text">{strength.title}</h3>
              <p className="mt-2 text-sm text-text-muted">{strength.description}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
