import { COOKIE_POLICY_APPROVED } from "./status";
import type { LegalDocument } from "./types";

// DRAFT pending legal review (docs/audits/legal-pending-data.md). Every
// statement describes what the site actually does today (verified in the
// code), never an invented practice. Facts the business hasn't provided are
// `[[PENDIENTE: …]]` markers, rendered visibly — never filled with a guess.

export const COOKIE_POLICY: LegalDocument = {
  slug: "cookies",
  title: "Política de cookies",
  description: "Qué cookies y almacenamiento usa el sitio de Soluciones Ópticas y para qué.",
  updated: "2026-10-16",
  approved: COOKIE_POLICY_APPROVED,
  sections: [
    {
      id: "resumen",
      title: "En resumen",
      paragraphs: [
        "Este sitio solo usa cookies técnicas necesarias para iniciar sesión y una preferencia de tema guardada en tu navegador. No usa cookies de analítica, publicidad ni seguimiento, por eso no te mostramos un aviso para aceptarlas o rechazarlas.",
      ],
    },
    {
      id: "necesarias",
      title: "Cookies necesarias",
      paragraphs: ["Se crean solo cuando iniciás sesión y desaparecen al cerrarla:"],
      items: [
        "sopt_access_token: mantiene tu sesión iniciada. Dura 15 minutos y se renueva sola.",
        "sopt_refresh_token: permite renovar la sesión sin volver a ingresar la contraseña. Dura hasta 30 días.",
        "Ambas son HttpOnly (el código de la página no puede leerlas) y en el sitio publicado solo viajan por conexiones seguras (HTTPS).",
      ],
    },
    {
      id: "preferencias",
      title: "Preferencias",
      paragraphs: [
        "Si elegís un tema (claro u oscuro) con el selector del encabezado, se guarda en el almacenamiento local de tu navegador (sopt-theme). No es una cookie y no se envía a ningún servidor. Si elegís «Sistema», no se guarda nada.",
      ],
    },
    {
      id: "terceros",
      title: "Terceros",
      paragraphs: [
        "Las fotos de productos se cargan desde Cloudinary y las fuentes tipográficas se sirven desde este mismo sitio. Este sitio no inserta cookies de terceros.",
      ],
    },
    {
      id: "control",
      title: "Cómo controlarlas",
      paragraphs: [
        "Podés borrar las cookies y el almacenamiento local desde la configuración de tu navegador. Si borrás las cookies necesarias, tendrás que volver a iniciar sesión.",
        "Si en el futuro se incorpora analítica, se pedirá tu consentimiento antes de activarla y vas a poder cambiar tu elección desde esta página.",
      ],
    },
  ],
};

export default COOKIE_POLICY;
