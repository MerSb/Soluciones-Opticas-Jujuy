import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";
import { InvoicingProviderError } from "../invoicing-provider.js";

// WSAA client (Especificación Técnica WSAA 1.2.2 + manual del desarrollador):
// 1. LoginTicketRequest (TRA) with uniqueId, generationTime, expirationTime
//    and the business service ("wsfe");
// 2. CMS SignedData with the TRA inside, signed with the certificate's key
//    (the content travels attached, like `openssl cms -sign -nodetach`);
// 3. Base64 → loginCms (SOAP) → LoginTicketResponse with token, sign and
//    expirationTime (12 h).
// The ticket is cached in memory and reused while valid: asking again for
// the same service within minutes returns coe.alreadyAuthenticated.
// Nothing here ever logs or returns the key, certificate, token or sign.

export const WSAA_HOMOLOGATION_URL = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";

export interface AccessTicket {
  token: string;
  sign: string;
  expiresAt: Date;
}

export interface WsaaOptions {
  url: string;
  certificatePem: string;
  privateKeyPem: string;
  service: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/** ISO 8601 with the local offset, as in the manual's examples. */
function isoWithOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const pad = (value: number) => String(Math.trunc(Math.abs(value))).padStart(2, "0");
  const local = new Date(date.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 19);
  return `${local}${sign}${pad(offsetMinutes / 60)}:${pad(offsetMinutes % 60)}`;
}

export function buildLoginTicketRequest(service: string, now: Date, uniqueId: number): string {
  // A 10-minute window either side tolerates small clock differences; the
  // WSAA accepts up to 24 h, but a short window limits replay.
  const generation = new Date(now.getTime() - 10 * 60_000);
  const expiration = new Date(now.getTime() + 10 * 60_000);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<loginTicketRequest version="1.0"><header>` +
    `<uniqueId>${uniqueId}</uniqueId>` +
    `<generationTime>${isoWithOffset(generation)}</generationTime>` +
    `<expirationTime>${isoWithOffset(expiration)}</expirationTime>` +
    `</header><service>${service}</service></loginTicketRequest>`
  );
}

/** CMS SignedData (PKCS#7) with the TRA attached, DER → Base64. */
export function signLoginTicketRequest(tra: string, certificatePem: string, privateKeyPem: string) {
  let certificate: forge.pki.Certificate;
  let privateKey: forge.pki.PrivateKey;
  try {
    certificate = forge.pki.certificateFromPem(certificatePem);
    privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  } catch {
    throw new InvoicingProviderError("El certificado o la clave privada no se pueden leer.", {
      uncertain: false,
    });
  }
  const signedData = forge.pkcs7.createSignedData();
  signedData.content = forge.util.createBuffer(tra, "utf8");
  signedData.addCertificate(certificate);
  signedData.addSigner({
    key: privateKey,
    certificate,
    digestAlgorithm: forge.pki.oids.sha256!,
    // node-forge fills messageDigest itself and accepts a Date for
    // signingTime; its typings want strings for both.
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType!, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest! },
      { type: forge.pki.oids.signingTime!, value: new Date() },
    ] as unknown as { type: string; value: string }[],
  });
  signedData.sign();
  const der = forge.asn1.toDer(signedData.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false });

export function parseLoginCmsResponse(soap: string): AccessTicket {
  const body = xml.parse(soap)?.Envelope?.Body;
  const fault = body?.Fault;
  if (fault) {
    const code = String(fault.faultcode ?? "");
    const message = String(fault.faultstring ?? "Error del WSAA");
    throw new InvoicingProviderError(
      code.includes("alreadyAuthenticated")
        ? "ARCA ya entregó un ticket vigente a este certificado y no da otro por unos minutos. Esperar y reintentar."
        : `WSAA: ${message}`,
      { uncertain: false },
    );
  }
  const inner = body?.loginCmsResponse?.loginCmsReturn;
  if (typeof inner !== "string") {
    throw new InvoicingProviderError("Respuesta del WSAA ilegible.", { uncertain: false });
  }
  const ticket = xml.parse(inner)?.loginTicketResponse;
  const token = ticket?.credentials?.token;
  const sign = ticket?.credentials?.sign;
  const expiresAt = new Date(String(ticket?.header?.expirationTime ?? ""));
  if (typeof token !== "string" || typeof sign !== "string" || Number.isNaN(expiresAt.getTime())) {
    throw new InvoicingProviderError("Ticket de acceso incompleto.", { uncertain: false });
  }
  return { token, sign, expiresAt };
}

export function createWsaaClient(options: WsaaOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  let cached: AccessTicket | null = null;
  let pending: Promise<AccessTicket> | null = null;

  async function login(): Promise<AccessTicket> {
    const tra = buildLoginTicketRequest(options.service, now(), Math.floor(now().getTime() / 1000));
    const cms = signLoginTicketRequest(tra, options.certificatePem, options.privateKeyPem);
    const envelope =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ` +
      `xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
      `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms>` +
      `</soapenv:Body></soapenv:Envelope>`;
    let response: Response;
    try {
      response = await fetchImpl(options.url, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
        body: envelope,
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch {
      // Logging in changes nothing at ARCA: never "uncertain".
      throw new InvoicingProviderError("No se pudo conectar con el WSAA.", { uncertain: false });
    }
    return parseLoginCmsResponse(await response.text());
  }

  return {
    /** A valid ticket, renewed 5 minutes before it expires. */
    async getTicket(): Promise<AccessTicket> {
      if (cached && cached.expiresAt.getTime() - now().getTime() > 5 * 60_000) return cached;
      // Concurrent callers share one login (a second one would be refused).
      pending ??= login().finally(() => {
        pending = null;
      });
      cached = await pending;
      return cached;
    },
    clear() {
      cached = null;
    },
  };
}
