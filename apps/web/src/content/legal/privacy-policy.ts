import { siteContent } from "../site-content";
import { PRIVACY_POLICY_APPROVED } from "./status";
import { LEGAL_CONTACT, type LegalDocument } from "./types";

// DRAFT pending legal review (docs/audits/legal-pending-data.md). Every
// statement describes what the site actually does today (verified in the
// code), never an invented practice. Facts the business hasn't provided are
// `[[PENDIENTE: …]]` markers, rendered visibly — never filled with a guess.

const { businessName, address } = siteContent;

export const PRIVACY_POLICY: LegalDocument = {
  slug: "privacidad",
  title: "Política de privacidad",
  description:
    "Qué datos personales trata Soluciones Ópticas en este sitio, para qué y cómo ejercer tus derechos.",
  updated: "2026-10-16",
  approved: PRIVACY_POLICY_APPROVED,
  sections: [
    {
      id: "responsable",
      title: "Responsable del tratamiento",
      paragraphs: [
        `${businessName} ([[PENDIENTE: razón social y CUIT]]), ${address}. Contacto: ${LEGAL_CONTACT}.`,
      ],
    },
    {
      id: "datos",
      title: "Qué datos tratamos",
      paragraphs: ["Solo los que vos nos das al usar funciones concretas del sitio:"],
      items: [
        "Si creás una cuenta: nombre, apellido, email y, si lo agregás, teléfono. Tu contraseña se guarda únicamente cifrada (nunca en texto legible).",
        "Si completás tu perfil óptico: las medidas de tu armazón actual y tus preferencias de forma, material, color y estilo. No pedimos ni guardamos recetas ni datos clínicos.",
        "Si guardás favoritos: los productos que marcaste.",
        "Para mantener tu sesión: dos cookies técnicas (ver la política de cookies).",
      ],
    },
    {
      id: "no-tratamos",
      title: "Qué no hacemos",
      paragraphs: [],
      items: [
        "No usamos herramientas de analítica, publicidad ni seguimiento.",
        "El formulario de contacto todavía no envía datos: lo que escribas ahí no sale de tu navegador.",
        "No cobramos pagos en línea ni guardamos datos de tarjetas.",
        "Al tocar «Consultar por WhatsApp» se abre WhatsApp con un mensaje sugerido; el sitio no envía nada por vos. Esa conversación se rige por las condiciones de WhatsApp.",
      ],
    },
    {
      id: "finalidad",
      title: "Para qué usamos los datos",
      paragraphs: [
        "Para darte acceso a tu cuenta, guardar tus favoritos y tu perfil óptico, y mostrarte recomendaciones de armazones según ese perfil. No vendemos ni cedemos tus datos a terceros con fines comerciales.",
      ],
    },
    {
      id: "proveedores",
      title: "Servicios que usamos para operar el sitio",
      paragraphs: [
        "El sitio se aloja en proveedores de infraestructura que procesan datos por cuenta nuestra para que funcione:",
      ],
      items: [
        "Vercel: publica la página web.",
        "Railway: aloja el servidor y la base de datos donde se guardan las cuentas.",
        "Cloudinary: aloja las fotos de los productos (no recibe datos de tus cuentas).",
        "Ubicación de los servidores y transferencias internacionales: [[PENDIENTE: confirmar con los proveedores y revisión jurídica]]",
      ],
    },
    {
      id: "conservacion",
      title: "Conservación",
      paragraphs: [
        "Los datos de tu cuenta se conservan mientras la cuenta exista. Plazos adicionales de conservación: [[PENDIENTE: definir]].",
        "Por seguridad, el servidor registra técnicamente cada solicitud (tipo, dirección de la página, resultado y duración) y limita temporalmente los intentos de inicio de sesión por dirección IP, sin guardarla en la base de datos.",
      ],
    },
    {
      id: "derechos",
      title: "Tus derechos",
      paragraphs: [
        "Podés acceder a tus datos, actualizarlos o pedir que se eliminen. Tu nombre, apellido, teléfono y perfil óptico se pueden modificar desde «Mi cuenta». Para pedir el acceso o la eliminación de tu cuenta, escribinos: " +
          LEGAL_CONTACT +
          ".",
        "La Ley 25.326 de Protección de los Datos Personales establece estos derechos. La Agencia de Acceso a la Información Pública es el órgano de control.",
      ],
    },
    {
      id: "cambios",
      title: "Cambios en esta política",
      paragraphs: [
        "Si cambia lo que hacemos con los datos (por ejemplo, si se incorporan pagos en línea o analítica), actualizaremos esta página antes de hacerlo.",
      ],
    },
  ],
};

export default PRIVACY_POLICY;
