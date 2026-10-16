# Documentos legales: datos pendientes y cómo aprobarlos

- **Fecha:** 2026-10-16
- **Estado:** los tres documentos (aviso legal, privacidad y cookies) están **en borrador y fuera del sitio publicado**.

Cada documento tiene un interruptor en `apps/web/src/content/legal/status.ts`, y hoy los tres están en `false`. Mientras esté en `false`:

- el build de producción no incluye la página, ni el link del footer, ni el texto (su URL responde 404);
- la analítica no puede activarse, porque depende de la política de cookies;
- el borrador solo se ve en local, con `npm run dev`, en `/aviso-legal`, `/privacidad` y `/cookies`.

Los borradores describen lo que el sitio hace hoy, verificado contra el código. **No se inventó ningún dato fiscal ni condición legal.**

## 1. Datos que tiene que dar el negocio

| #   | Dato                                                                                              | Dónde se usa                           | Marcador en el texto                                                |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| 1   | Razón social (titular del sitio: persona humana o sociedad)                                       | Aviso legal; Privacidad (responsable)  | `[[PENDIENTE: razón social]]`, `[[PENDIENTE: razón social y CUIT]]` |
| 2   | CUIT                                                                                              | Aviso legal; Privacidad                | `[[PENDIENTE: CUIT]]`                                               |
| 3   | Domicilio legal o fiscal (si difiere del local de Alvear 732)                                     | Aviso legal                            | `[[PENDIENTE: domicilio legal o fiscal]]`                           |
| 4   | Email de contacto para temas legales y de datos personales                                        | Aviso legal (y conviene en Privacidad) | `[[PENDIENTE: email de contacto]]`                                  |
| 5   | Plazos de conservación más allá de "mientras exista la cuenta"                                    | Privacidad → Conservación              | `[[PENDIENTE: definir]]`                                            |
| 6   | Ubicación de los servidores de Vercel, Railway y Cloudinary, y si hay transferencia internacional | Privacidad → Proveedores               | `[[PENDIENTE: confirmar con los proveedores y revisión jurídica]]`  |

La política de cookies no tiene datos pendientes. Igual necesita la aprobación del asesor (§2) antes de publicarse.

## 2. Preguntas para el asesor legal

Estas preguntas no son afirmaciones del equipo técnico: las tiene que responder el asesor.

- **Ley 25.326:** ¿hay que inscribir la base de datos de clientes en el registro de la Agencia de Acceso a la Información Pública? Si corresponde, ¿se cita el número de inscripción en la política de privacidad?
- **Defensa del consumidor:** ¿qué textos exige la normativa (por ejemplo, el botón de arrepentimiento) para un sitio que **hoy no vende en línea**? Las consultas y compras se coordinan por WhatsApp o en el local. ¿Qué cambia cuando se habilite Payments V1?
- **Analítica:** si más adelante se configura Google Analytics 4, ¿alcanza con el consentimiento previo (aceptar o rechazar, con el mismo peso visual) y con lo que se agregaría a la política de cookies? ¿Cómo se informa la transferencia a Google?
- **Validez del texto:** ¿alcanzan las condiciones de uso y la limitación de responsabilidad del borrador, o hay que agregar jurisdicción o ley aplicable?

## 3. Cómo se aprueba y publica un documento

1. Completar los datos de §1 en `apps/web/src/content/legal/<documento>.ts` y borrar los marcadores `[[PENDIENTE: …]]`.
2. Obtener la aprobación del texto final (del negocio y del asesor) por escrito.
3. Cambiar su interruptor a `true` en `status.ts` y actualizar la fecha `updated` del documento.
4. Correr `npm run test:web` y `npm run build:web`. Hay tres guardas:
   - un test rechaza un documento aprobado que todavía tenga marcadores;
   - el build falla si un marcador llega a `dist`;
   - un test verifica que el documento, la entrada del footer y la de SEO coincidan.
5. Una vez aprobado, la página aparece en el footer, se genera su HTML y deja de llevar `noindex`.
6. Deploy con el procedimiento habitual: revisión, preview y producción.

Los documentos se publican de a uno; no hace falta aprobar los tres juntos.
