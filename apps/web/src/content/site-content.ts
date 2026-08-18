// Central institutional content. Anything client-specific that hasn't
// been provided yet is `null`, never an invented value — components
// consuming a null field are responsible for degrading gracefully
// (see WhatsAppButton), not for making something up.
//
// See docs/CLIENT_CONTENT_CHECKLIST.md for the full list of what's
// still needed from Soluciones Ópticas before launch, and why each
// field below is what it is.

export interface SiteContent {
  businessName: string;
  city: string;
  /** Confirmed street address. Null: not yet provided. */
  address: string | null;
  /** E.164-ish, digits only after the leading +. Null: not yet provided. */
  whatsappNumber: string | null;
  /** Canonical display format — every consumer renders this string as-is, never a re-formatted variant (see lib/format-phone.ts for the tel: href form). */
  phone: string | null;
  email: string | null;
  socialLinks: { label: string; url: string }[];
  about: {
    history: string;
    mission: string;
    values: string[];
    serviceApproach: string;
  };
  strengths: { title: string; description: string }[];
  /** Compact 4-item strip for the Hero's bottom benefit panel — short, icon-friendly copy, deliberately distinct from `strengths` (used later on the same Home page by WhyChooseUsSection) and deliberately neutral: no unconfirmed claims like "Marcas originales"/"Calidad óptica"/"Garantía" (see Hero refinement step's report). */
  heroBenefits: { title: string; description: string }[];
  /**
   * Confirmed brand NAMES only (Premium Visual Experience step) —
   * institutional/marketing content, not the same thing as the
   * database-backed `GET /api/brands` list BrandsPage/BrandCard read.
   * Deliberately kept separate: the DB brands table today holds
   * fictional dev-seed brands (Andina Eyewear, etc.) tied to fictional
   * dev-seed products/prices — renaming those rows to these real names
   * would misattribute fake products/prices to a real confirmed brand,
   * which is worse than generic placeholder names. No logos,
   * descriptions, or per-brand pages exist for these yet — see
   * BrandRail.tsx and CLIENT_CONTENT_CHECKLIST.md.
   */
  confirmedBrands: string[];
}

export const siteContent: SiteContent = {
  businessName: "Soluciones Ópticas",
  // The repository/business name itself establishes this — not invented.
  city: "Jujuy, Argentina",

  // Confirmed by the client in the Hero Refinement step (2026-08-17).
  address: "Alvear 732, San Salvador de Jujuy, Jujuy",
  // Confirmed by the client as both the telephone and WhatsApp number.
  // Display format kept exactly as given; digits: 0388 484-4442 -> area
  // code 388, local number 4844442. Normalized for wa.me as
  // 54 (AR) + 9 (mobile-number prefix, matching the convention this
  // project's own whatsapp.test.ts already assumes for AR numbers) +
  // the national number without its leading 0 -> 5493884844442. This
  // hasn't been click-tested against a live WhatsApp account in this
  // sandboxed environment — worth a real click-through check once
  // deployed.
  whatsappNumber: "5493884844442",
  phone: "0388 484-4442",
  email: null,
  socialLinks: [],

  // PLACEHOLDER — neutral, professional copy that doesn't claim a
  // specific founding year, headcount, or history. Replace with the
  // client's real history/mission/values once provided.
  about: {
    history:
      "Soluciones Ópticas trabaja para ofrecer productos ópticos y una atención cercana a sus clientes en Jujuy. Esta sección se completará con la historia real de la óptica.",
    mission:
      "Ayudar a cada cliente a encontrar la solución óptica adecuada para su estilo de vida, con asesoramiento profesional y una atención personalizada.",
    values: ["Atención personalizada", "Calidad en cada producto", "Confianza y transparencia"],
    serviceApproach:
      "Cada visita es una oportunidad para asesorar con criterio profesional, sin apuros ni presiones, priorizando lo que cada persona realmente necesita.",
  },

  // Neutral, non-specific claims only — no years in business, customer
  // counts, awards, or guarantees, since none have been confirmed.
  strengths: [
    {
      title: "Atención personalizada",
      description:
        "Te acompañamos para encontrar el armazón y la solución óptica que mejor te queden.",
    },
    {
      title: "Variedad de marcas y estilos",
      description: "Un catálogo pensado para distintos gustos, necesidades y presupuestos.",
    },
    {
      title: "Varias sucursales en Jujuy",
      description: "Encontrá la sucursal más cercana y conocé horarios y formas de contacto.",
    },
    {
      title: "Asesoramiento profesional",
      description: "Te ayudamos a elegir con criterio, sin apuros, priorizando lo que necesitás.",
    },
  ],

  // Deliberately NOT "Marcas originales" / "Calidad óptica" / "Garantía"
  // — those specific claims appeared in the Hero's visual reference but
  // aren't confirmed facts (no certification, no stated warranty terms),
  // so this uses the neutral replacements the Hero Refinement step
  // itself calls out as safe: variety, personalized attention, the
  // catalog, and a direct invitation to ask.
  heroBenefits: [
    {
      title: "Variedad de estilos",
      description: "Marcos para recetados, sol y uso deportivo.",
    },
    {
      title: "Atención personalizada",
      description: "Te ayudamos a elegir sin apuros.",
    },
    {
      title: "Encontrá tu marco",
      description: "Explorá el catálogo completo online.",
    },
    {
      title: "Consultanos",
      description: "Por WhatsApp o en cualquier sucursal.",
    },
  ],

  // Confirmed by the client in the Premium Visual Experience step
  // (2026-08-18). Names only — no logos scraped from the internet, no
  // invented descriptions/history, per that step's explicit instruction.
  confirmedBrands: [
    "ELEVE",
    "Pierre Cardin",
    "Bulk",
    "Carolina Emanuel",
    "Mistral Lentes",
    "Valdez",
    "Ruana",
    "Unicity",
    "Baku",
    "Fioralba Lentes",
  ],
};
