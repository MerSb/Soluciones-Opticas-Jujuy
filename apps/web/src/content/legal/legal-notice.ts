import { siteContent } from "../site-content";
import { LEGAL_NOTICE_APPROVED } from "./status";
import { LEGAL_CONTACT, type LegalDocument } from "./types";

// DRAFT pending legal review (docs/audits/legal-pending-data.md). Every
// statement describes what the site actually does today (verified in the
// code), never an invented practice. Facts the business hasn't provided are
// `[[PENDIENTE: …]]` markers, rendered visibly — never filled with a guess.

const { businessName, address, phone } = siteContent;

export const LEGAL_NOTICE: LegalDocument = {
  slug: "aviso-legal",
  title: "Aviso legal",
  description: "Quién es responsable de este sitio, para qué existe y las condiciones de uso.",
  updated: "2026-10-16",
  approved: LEGAL_NOTICE_APPROVED,
  sections: [
    {
      id: "responsable",
      title: "Responsable del sitio",
      paragraphs: [
        `Este sitio pertenece a ${businessName}, óptica con local en ${address}, Argentina.`,
      ],
      items: [
        "Razón social: [[PENDIENTE: razón social]]",
        "CUIT: [[PENDIENTE: CUIT]]",
        "Domicilio legal: [[PENDIENTE: domicilio legal o fiscal]]",
        `Teléfono y WhatsApp: ${phone}`,
        "Correo electrónico: [[PENDIENTE: email de contacto]]",
      ],
    },
    {
      id: "finalidad",
      title: "Finalidad del sitio",
      paragraphs: [
        "Mostrar los productos de la óptica (anteojos y accesorios) con su precio y disponibilidad informativos, y facilitar el contacto para consultas y compras.",
        "Por ahora las compras se coordinan por WhatsApp o en el local: el sitio no cobra pagos en línea. Los precios y la disponibilidad que se muestran están sujetos a confirmación.",
      ],
    },
    {
      id: "uso",
      title: "Condiciones generales de uso",
      paragraphs: [
        "Al usar el sitio te comprometés a hacerlo de buena fe y conforme a la ley: no intentar acceder a cuentas ajenas ni a las secciones de administración, no automatizar solicitudes abusivas y no cargar información falsa o de terceros sin autorización.",
        "Para guardar favoritos y tu perfil óptico podés crear una cuenta. Sos responsable de mantener tu contraseña en reserva.",
      ],
    },
    {
      id: "propiedad",
      title: "Propiedad intelectual",
      paragraphs: [
        `El logo, los textos y las fotografías propias de ${businessName} no pueden reproducirse sin autorización. Las marcas de los productos pertenecen a sus respectivos titulares.`,
      ],
    },
    {
      id: "responsabilidad",
      title: "Limitaciones y responsabilidades",
      paragraphs: [
        "Procuramos que la información sea correcta y esté actualizada, pero puede contener errores u omisiones. Las fotos son ilustrativas y los colores pueden variar según la pantalla.",
        "Las medidas de los armazones que muestra el sitio no reemplazan una consulta profesional ni una medición óptica personal.",
        "Los enlaces a servicios de terceros (por ejemplo WhatsApp o Google Maps) se rigen por las condiciones de esos servicios.",
      ],
    },
    {
      id: "contacto",
      title: "Contacto",
      paragraphs: [`Para cualquier consulta sobre este aviso: ${LEGAL_CONTACT}.`],
    },
  ],
};

export default LEGAL_NOTICE;
