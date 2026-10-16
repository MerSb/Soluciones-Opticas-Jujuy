import { siteContent } from "./site-content";

// Legal pages — DRAFTS pending legal review (docs/audits/website-20-point-audit.md).
// Every statement describes what the site actually does today (verified
// in the code), never an invented practice. Facts the business hasn't
// provided are written as `[[PENDIENTE: …]]` and rendered as a visible
// marker — never filled with a guess (no CUIT, company name, tax
// address or retention periods are invented).

export interface LegalSection {
  id: string;
  title: string;
  paragraphs: string[];
  items?: string[];
}

export interface LegalDocument {
  slug: string;
  title: string;
  description: string;
  /** Last edit of the draft (not an approval date). */
  updated: string;
  sections: LegalSection[];
}

const { businessName, address, phone } = siteContent;
const CONTACT = `WhatsApp o teléfono ${phone}, o en el local de ${address}`;

export const LEGAL_NOTICE: LegalDocument = {
  slug: "aviso-legal",
  title: "Aviso legal",
  description: "Quién es responsable de este sitio, para qué existe y las condiciones de uso.",
  updated: "2026-10-16",
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
      paragraphs: [`Para cualquier consulta sobre este aviso: ${CONTACT}.`],
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  slug: "privacidad",
  title: "Política de privacidad",
  description:
    "Qué datos personales trata Soluciones Ópticas en este sitio, para qué y cómo ejercer tus derechos.",
  updated: "2026-10-16",
  sections: [
    {
      id: "responsable",
      title: "Responsable del tratamiento",
      paragraphs: [
        `${businessName} ([[PENDIENTE: razón social y CUIT]]), ${address}. Contacto: ${CONTACT}.`,
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
          CONTACT +
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

export const COOKIE_POLICY: LegalDocument = {
  slug: "cookies",
  title: "Política de cookies",
  description: "Qué cookies y almacenamiento usa el sitio de Soluciones Ópticas y para qué.",
  updated: "2026-10-16",
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
