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
  /** E.164-ish, digits only after the leading +. Null: not yet provided. */
  whatsappNumber: string | null;
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
}

export const siteContent: SiteContent = {
  businessName: "Soluciones Ópticas",
  // The repository/business name itself establishes this — not invented.
  city: "Jujuy, Argentina",

  whatsappNumber: null,
  phone: null,
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
};
