import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/marketing/SectionHeading";
import { siteContent } from "../content/site-content";

// Structured around history/mission/values/service-approach per the
// brief — content itself is neutral placeholder copy from
// siteContent.about, pending the client's real history. See
// docs/CLIENT_CONTENT_CHECKLIST.md.
export function AboutPage() {
  const { about } = siteContent;

  return (
    <>
      <SeoHead
        title="Nosotros"
        description="Conocé la historia, la misión y los valores de Soluciones Ópticas."
        canonicalPath="/about"
      />
      <Container className="py-16">
        <SectionHeading eyebrow="Nosotros" title="Quiénes somos" />

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
          <section>
            <h2 className="font-display text-xl text-text">Nuestra historia</h2>
            <p className="mt-3 text-text-muted">{about.history}</p>
          </section>

          <section>
            <h2 className="font-display text-xl text-text">Nuestra misión</h2>
            <p className="mt-3 text-text-muted">{about.mission}</p>
          </section>

          <section>
            <h2 className="font-display text-xl text-text">Nuestros valores</h2>
            <ul className="mt-3 space-y-2 text-text-muted">
              {about.values.map((value) => (
                <li key={value} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  />
                  {value}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl text-text">Nuestro enfoque de atención</h2>
            <p className="mt-3 text-text-muted">{about.serviceApproach}</p>
          </section>
        </div>
      </Container>
    </>
  );
}
