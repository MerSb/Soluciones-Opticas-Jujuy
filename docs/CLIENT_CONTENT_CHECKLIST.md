# Client Content Checklist — Home & Institutional Pages

What's still needed from Soluciones Ópticas before this content is production-ready. Nothing
below blocked implementation — every gap uses honest, neutral placeholder handling (see
`apps/web/src/content/site-content.ts`), never an invented fact. This list is how to replace each
one.

## Blocking a real, working feature right now

| Item                | Where it's used                 | Current state                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WhatsApp number** | Hero, closing CTA, Contact page | Not set (`siteContent.whatsappNumber = null`). The button renders in a clearly disabled "Número de WhatsApp a confirmar" state — real, not a placeholder link, so nothing sends a customer to a wrong number. Set the real number and every WhatsApp CTA site-wide activates at once. |
| **Phone number**    | Contact page                    | Shows "A confirmar."                                                                                                                                                                                                                                                                  |
| **Email address**   | Contact page                    | Shows "A confirmar."                                                                                                                                                                                                                                                                  |

## Branch data (currently fictional dev-seed data)

The Branches/Home pages already pull real data from the database (`GET /api/branches`) — the
mechanism is done and tested. What's in there **right now is fictional development data**
(`Sucursal Centro`, `Sucursal Norte`, addresses explicitly suffixed "(desarrollo — dirección
ficticia)" in the seed script itself, so it's visibly marked as provisional even in a live
preview). Needed per real branch:

- Name
- Full address (used to build the "Ver en el mapa" link automatically — no coordinates needed,
  but a real address is)
- Phone
- WhatsApp number
- Opening hours (any format — rendered as whatever key/value pairs are stored; if there's a
  cleaner structure you'd prefer, flag it and the display can be adjusted)
- Optionally, a direct Google Maps URL (used instead of the address-based search link, if you
  have one you prefer)

## Brand data (currently fictional dev-seed data)

Same situation: `GET /api/brands` works and is tested; the three brands showing right now
(Andina Eyewear, Lumen Óptica, Cielo Frames) are fictional placeholders for development, each
already labeled "Marca de desarrollo — datos ficticios" in their description field. Needed:

- Real brand list
- Logos (optional — cards fall back to a clean monogram when there's no logo; Cloudinary image
  upload/delivery isn't wired up yet regardless, so logos become usable once that integration
  step happens)

## About page

`siteContent.about` currently holds neutral, non-committal placeholder copy (no invented founding
year, headcount, or specific history). Real content wanted for:

- Company history
- Mission statement
- Values (currently: "Atención personalizada," "Calidad en cada producto," "Confianza y
  transparencia" — generic placeholders)
- Customer service philosophy/approach

## Visual identity

- **Logo:** none exists yet — the header/footer currently show the business name as styled text
  (serif wordmark), not a logo mark. A real logo can replace or sit alongside this.
- **Preferred colors:** none specified — the current palette (deep teal `#0f5c56` primary, warm
  copper `#c17a4f` accent) was chosen to read as trustworthy/clinical/premium for an optical
  business, not copied from a brief. Happy to adjust if there's an existing brand color
  preference.
- **Photography:** none used yet, deliberately — no stock photos, no images copied from other
  optical retailers' sites. The Hero currently uses an abstract two-circle motif (pure CSS, evokes
  lenses) instead of a photo. Real storefront/staff/product photography would be a direct
  upgrade whenever available — swapping it in only touches `components/marketing/Hero.tsx`.
- **Social media links:** none provided — not rendered anywhere yet (`siteContent.socialLinks` is
  an empty array).

## Not blocking anything, informational only

- **Services offered:** the "Por qué elegirnos" section on Home uses deliberately generic
  strengths (personalized attention, brand variety, multiple branches, professional advice) —
  no specific services (eye exams, contact lens fitting, etc.) are claimed since none were
  confirmed. If there are specific services worth highlighting, they can be added there.
- **Years in business, customer counts, certifications, awards, guarantees:** none appear
  anywhere on the site — these were explicitly excluded rather than estimated, per this step's
  own instruction not to invent them.
