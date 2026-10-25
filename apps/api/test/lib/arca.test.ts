import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import forge from "node-forge";
import { computeVoucherAmounts } from "../../src/lib/arca/amounts.js";
import { buildQrPayload, buildQrUrl } from "../../src/lib/arca/qr.js";
import {
  buildLoginTicketRequest,
  createWsaaClient,
  parseLoginCmsResponse,
  signLoginTicketRequest,
} from "../../src/lib/arca/wsaa.js";
import {
  buildAuthorizeBody,
  createWsfeProvider,
  parseAuthorizeResponse,
  parseConsultResponse,
  parseLastAuthorizedResponse,
} from "../../src/lib/arca/wsfe.js";
import { InvoicingProviderError, type VoucherRequest } from "../../src/lib/invoicing-provider.js";

// Unit tests of the ARCA building blocks (ADR-0036) against the official
// documents: QR specification (RG 4892/2020), WSAA technical
// specification 1.2.2 and the WSFEv1 manual v4.8. Every CUIT, CAE and
// person here is fictitious (the manuals' own sample values).

describe("voucher amounts from prices as paid (WSFEv1 v4.8 formulas)", () => {
  it("class C: no VAT, ImpNeto = ImpTotal = what was paid", () => {
    const amounts = computeVoucherAmounts("C", [
      { quantity: "2", unitPrice: "1500.50", vatRateCode: null },
      { quantity: "1", unitPrice: "999.99", vatRateCode: null },
    ]);
    expect(amounts.netAmount.toFixed(2)).toBe("4000.99");
    expect(amounts.vatAmount.toFixed(2)).toBe("0.00");
    expect(amounts.totalAmount.toFixed(2)).toBe("4000.99");
    expect(amounts.vatLines).toEqual([]);
  });

  it("class A/B: the total stays exactly what was paid; one AlicIva per rate", () => {
    // 121 paid at 21% → 100 + 21; 110.50 paid at 10.5% → 100 + 10.50.
    const amounts = computeVoucherAmounts("B", [
      { quantity: "1", unitPrice: "121.00", vatRateCode: 5 },
      { quantity: "1", unitPrice: "110.50", vatRateCode: 4 },
    ]);
    expect(amounts.totalAmount.toFixed(2)).toBe("231.50");
    expect(amounts.netAmount.toFixed(2)).toBe("200.00");
    expect(amounts.vatAmount.toFixed(2)).toBe("31.50");
    expect(
      amounts.vatLines.map((line) => [line.code, line.base.toFixed(2), line.amount.toFixed(2)]),
    ).toEqual([
      [4, "100.00", "10.50"],
      [5, "100.00", "21.00"],
    ]);
  });

  it("rounds the base and keeps base + VAT = paid (ImpTotal formula)", () => {
    const amounts = computeVoucherAmounts("B", [
      { quantity: "3", unitPrice: "33333.33", vatRateCode: 5 },
    ]);
    const [line] = amounts.vatLines;
    expect(amounts.totalAmount.toFixed(2)).toBe("99999.99");
    expect(line!.base.add(line!.amount).toFixed(2)).toBe("99999.99");
    expect(line!.base.toFixed(2)).toBe("82644.62");
    // ARCA checks AlicIva ≈ base × rate (absolute/relative error margin).
    expect(line!.amount.sub(line!.base.mul("0.21")).abs().lte("0.01")).toBe(true);
  });

  it("never assumes a VAT rate, and refuses VAT on a class C voucher", () => {
    expect(() =>
      computeVoucherAmounts("B", [{ quantity: "1", unitPrice: "10", vatRateCode: null }]),
    ).toThrow(/alícuota de IVA/);
    expect(() =>
      computeVoucherAmounts("C", [{ quantity: "1", unitPrice: "10", vatRateCode: 5 }]),
    ).toThrow(/no lleva IVA/);
    expect(() =>
      computeVoucherAmounts("C", [{ quantity: "1", unitPrice: "0", vatRateCode: null }]),
    ).toThrow(/mayor a cero/);
  });
});

describe("fiscal QR (RG 4892/2020, JSON version 1)", () => {
  // The exact example of ARCA's specification.
  const example = {
    issueDate: "2020-10-13",
    issuerCuit: "30000000007",
    pointOfSale: 10,
    voucherType: 1,
    number: 94,
    total: "12100",
    currency: "DOL",
    exchangeRate: "65",
    receptorDocType: 80,
    receptorDocNumber: "20000000001",
    authorizationType: "E" as const,
    authorizationCode: "70417054367476",
  };

  it("produces the specification's JSON and Base64 byte for byte", () => {
    expect(JSON.stringify(buildQrPayload(example))).toBe(
      '{"ver":1,"fecha":"2020-10-13","cuit":30000000007,"ptoVta":10,"tipoCmp":1,"nroCmp":94,"importe":12100,"moneda":"DOL","ctz":65,"tipoDocRec":80,"nroDocRec":20000000001,"tipoCodAut":"E","codAut":70417054367476}',
    );
    expect(buildQrUrl(example)).toBe(
      "https://www.arca.gob.ar/fe/qr/?p=eyJ2ZXIiOjEsImZlY2hhIjoiMjAyMC0xMC0xMyIsImN1aXQiOjMwMDAwMDAwMDA3LCJwdG9WdGEiOjEwLCJ0aXBvQ21wIjoxLCJucm9DbXAiOjk0LCJpbXBvcnRlIjoxMjEwMCwibW9uZWRhIjoiRE9MIiwiY3R6Ijo2NSwidGlwb0RvY1JlYyI6ODAsIm5yb0RvY1JlYyI6MjAwMDAwMDAwMDEsInRpcG9Db2RBdXQiOiJFIiwiY29kQXV0Ijo3MDQxNzA1NDM2NzQ3Nn0=",
    );
  });

  it("leaves the receptor out when it is not identified", () => {
    const payload = buildQrPayload({
      ...example,
      receptorDocType: undefined,
      receptorDocNumber: undefined,
    });
    expect(payload).not.toHaveProperty("tipoDocRec");
    expect(payload).not.toHaveProperty("nroDocRec");
  });
});

function testCertificate() {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const subject = [
    { name: "commonName", value: "prueba-ficticia" },
    { name: "organizationName", value: "Empresa Ficticia" },
    { name: "countryName", value: "AR" },
    { type: "2.5.4.5", value: "CUIT 20111111112" },
  ];
  cert.setSubject(subject);
  cert.setIssuer(subject);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certificatePem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

const loginResponse = (expiration: string) => {
  const ticket =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><loginTicketResponse version="1.0"><header>` +
    `<source>CN=wsaahomo, O=AFIP, C=AR, SERIALNUMBER=CUIT 33693450239</source>` +
    `<uniqueId>3866895167</uniqueId><generationTime>2019-09-26T13:56:14.467-03:00</generationTime>` +
    `<expirationTime>${expiration}</expirationTime></header>` +
    `<credentials><token>TOKEN-FICTICIO</token><sign>SIGN-FICTICIO</sign></credentials></loginTicketResponse>`;
  const escaped = ticket.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>` +
    `<loginCmsResponse xmlns="https://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${escaped}</loginCmsReturn>` +
    `</loginCmsResponse></soapenv:Body></soapenv:Envelope>`
  );
};

describe("WSAA (especificación técnica 1.2.2)", () => {
  it("builds a TRA for wsfe with uniqueId and a short validity window", () => {
    const tra = buildLoginTicketRequest("wsfe", new Date("2026-10-25T15:00:00Z"), 4325399);
    expect(tra).toContain("<uniqueId>4325399</uniqueId>");
    expect(tra).toContain("<service>wsfe</service>");
    const times = [...tra.matchAll(/<(generationTime|expirationTime)>([^<]+)</g)].map((m) =>
      Date.parse(m[2]!),
    );
    expect(times[1]! - times[0]!).toBe(20 * 60_000);
  });

  it("signs a CMS SignedData that carries the TRA and the certificate", () => {
    const { certificatePem, privateKeyPem } = testCertificate();
    const tra = buildLoginTicketRequest("wsfe", new Date(), 1);
    const cms = signLoginTicketRequest(tra, certificatePem, privateKeyPem);
    expect(cms).not.toContain("PRIVATE");
    const message = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(forge.util.decode64(cms)),
    ) as forge.pkcs7.PkcsSignedData;
    expect(message.certificates).toHaveLength(1);
    // Independent check with OpenSSL (what the WSAA manual uses): the
    // signature verifies and the attached content is exactly the TRA.
    const dir = mkdtempSync(path.join(tmpdir(), "wsaa-"));
    try {
      writeFileSync(path.join(dir, "cert.pem"), certificatePem);
      writeFileSync(path.join(dir, "tra.cms"), Buffer.from(cms, "base64"));
      const content = execFileSync(
        "openssl",
        [
          "cms",
          "-verify",
          "-inform",
          "DER",
          "-in",
          path.join(dir, "tra.cms"),
          "-CAfile",
          path.join(dir, "cert.pem"),
          "-purpose",
          "any",
        ],
        { stdio: ["ignore", "pipe", "ignore"] },
      ).toString("utf8");
      expect(content).toBe(tra);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses an unreadable certificate without echoing it", () => {
    expect(() => signLoginTicketRequest("<x/>", "not a cert", "not a key")).toThrow(
      InvoicingProviderError,
    );
  });

  it("reads token, sign and expiration from loginCmsReturn", () => {
    const ticket = parseLoginCmsResponse(loginResponse("2019-09-27T01:56:14.467-03:00"));
    expect(ticket.token).toBe("TOKEN-FICTICIO");
    expect(ticket.sign).toBe("SIGN-FICTICIO");
    expect(ticket.expiresAt.toISOString()).toBe("2019-09-27T04:56:14.467Z");
  });

  it("explains coe.alreadyAuthenticated instead of retrying", () => {
    const fault =
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault>` +
      `<faultcode>ns1:coe.alreadyAuthenticated</faultcode><faultstring>El CEE ya posee un TA valido para el acceso al WSN solicitado</faultstring>` +
      `</soapenv:Fault></soapenv:Body></soapenv:Envelope>`;
    expect(() => parseLoginCmsResponse(fault)).toThrow(/ticket vigente/);
  });

  it("reuses the ticket while valid and shares one login between concurrent callers", async () => {
    const { certificatePem, privateKeyPem } = testCertificate();
    const expiration = new Date(Date.now() + 12 * 3_600_000).toISOString();
    const fetchImpl = vi.fn(async () => new Response(loginResponse(expiration)));
    const client = createWsaaClient({
      url: "https://wsaa.invalid/LoginCms",
      certificatePem,
      privateKeyPem,
      service: "wsfe",
      timeoutMs: 1000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [a, b] = await Promise.all([client.getTicket(), client.getTicket()]);
    await client.getTicket();
    expect(a.token).toBe(b.token);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

const request: VoucherRequest = {
  issuerCuit: "20111111112",
  pointOfSale: 12,
  voucherType: 1,
  number: 1,
  concept: 1,
  docType: 80,
  docNumber: "20111111112",
  issueDate: "20100903",
  total: "176.25",
  untaxed: "0.00",
  net: "150.00",
  exempt: "0.00",
  otherTaxes: "0.00",
  vat: "26.25",
  currency: "PES",
  exchangeRate: "1",
  receptorIvaConditionId: 1,
  vatLines: [
    { code: 4, base: "50.00", amount: "5.25" },
    { code: 5, base: "100.00", amount: "21.00" },
  ],
};

const soap = (inner: string) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${inner}</soap:Body></soap:Envelope>`;

const authorizeResponse = (detail: string, extra = "") =>
  soap(
    `<FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECAESolicitarResult>` +
      `<FeCabResp><Cuit>20111111112</Cuit><PtoVta>12</PtoVta><CbteTipo>1</CbteTipo><FchProceso>20100903104020</FchProceso>` +
      `<CantReg>1</CantReg><Resultado>${detail.includes("<Resultado>A") ? "A" : "R"}</Resultado></FeCabResp>` +
      `<FeDetResp><FEDetResponse>${detail}</FEDetResponse></FeDetResp>${extra}</FECAESolicitarResult></FECAESolicitarResponse>`,
  );

describe("WSFEv1 (manual v4.8)", () => {
  it("sends one voucher with CondicionIVAReceptorId and one AlicIva per rate", () => {
    const body = buildAuthorizeBody(request);
    expect(body).toContain("<ar:CantReg>1</ar:CantReg>");
    expect(body).toContain("<ar:CbteDesde>1</ar:CbteDesde><ar:CbteHasta>1</ar:CbteHasta>");
    expect(body).toContain("<ar:CondicionIVAReceptorId>1</ar:CondicionIVAReceptorId>");
    expect(body.match(/<ar:AlicIva>/g)).toHaveLength(2);
    expect(buildAuthorizeBody({ ...request, vatLines: [] })).not.toContain("<ar:Iva>");
  });

  it("reads an approval with CAE and its due date", () => {
    const result = parseAuthorizeResponse(
      authorizeResponse(
        `<Concepto>1</Concepto><DocTipo>80</DocTipo><DocNro>20111111112</DocNro><CbteDesde>1</CbteDesde><CbteHasta>1</CbteHasta>` +
          `<Resultado>A</Resultado><CAE>41124599911119</CAE><CbteFch>20100903</CbteFch><CAEFchVto>20100913</CAEFchVto>`,
      ),
    );
    expect(result).toEqual({
      outcome: "AUTHORIZED",
      cae: "41124599911119",
      caeDueDate: "20100913",
      observations: [],
    });
  });

  it("reads a rejection with its observations", () => {
    const result = parseAuthorizeResponse(
      authorizeResponse(
        `<CbteDesde>1</CbteDesde><Resultado>R</Resultado><Observaciones><Obs><Code>10016</Code>` +
          `<Msg>El numero o fecha del comprobante no se corresponde con el proximo a autorizar.</Msg></Obs></Observaciones>`,
      ),
    );
    expect(result.outcome).toBe("REJECTED");
    expect(result.outcome === "REJECTED" && result.observations[0]!.code).toBe(10016);
  });

  it("treats ARCA internal errors (500–502) and unreadable answers as uncertain", () => {
    const internal = soap(
      `<FECAESolicitarResponse><FECAESolicitarResult><Errors><Err><Code>502</Code><Msg>Error interno</Msg></Err></Errors>` +
        `</FECAESolicitarResult></FECAESolicitarResponse>`,
    );
    for (const answer of [internal, "<html>Service Unavailable</html>"]) {
      try {
        parseAuthorizeResponse(answer);
        expect.unreachable();
      } catch (error) {
        expect((error as InvoicingProviderError).uncertain).toBe(true);
      }
    }
  });

  it("reads the last authorized number and the consult answer, 602 meaning «no data»", () => {
    expect(
      parseLastAuthorizedResponse(
        soap(
          `<FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><PtoVta>12</PtoVta><CbteTipo>1</CbteTipo>` +
            `<CbteNro>94</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>`,
        ),
      ),
    ).toBe(94);
    expect(
      parseConsultResponse(
        soap(
          `<FECompConsultarResponse><FECompConsultarResult><Errors><Err><Code>602</Code>` +
            `<Msg>No existen datos en nuestros registros.</Msg></Err></Errors></FECompConsultarResult></FECompConsultarResponse>`,
        ),
      ),
    ).toBeNull();
    const found = parseConsultResponse(
      soap(
        `<FECompConsultarResponse><FECompConsultarResult><ResultGet><Concepto>1</Concepto><DocTipo>80</DocTipo>` +
          `<DocNro>20111111112</DocNro><CbteDesde>1</CbteDesde><CbteHasta>1</CbteHasta><CbteFch>20100903</CbteFch>` +
          `<ImpTotal>184.05</ImpTotal><Resultado>A</Resultado><CodAutorizacion>41124599911119</CodAutorizacion>` +
          `<EmisionTipo>CAE</EmisionTipo><FchVto>20100913</FchVto><PtoVta>12</PtoVta><CbteTipo>1</CbteTipo>` +
          `</ResultGet></FECompConsultarResult></FECompConsultarResponse>`,
      ),
    );
    expect(found).toMatchObject({
      number: 1,
      total: "184.05",
      authorizationCode: "41124599911119",
    });
  });

  it("never retries FECAESolicitar: a lost answer is uncertain; reads are retried", async () => {
    const ticket = async () => ({
      token: "T",
      sign: "S",
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const provider = createWsfeProvider({
      url: "https://wsfe.invalid/service.asmx",
      timeoutMs: 1000,
      getTicket: ticket,
      fetchImpl: failing as unknown as typeof fetch,
      readRetries: 2,
      retryDelayMs: 1,
    });
    await expect(provider.authorize(request)).rejects.toMatchObject({ uncertain: true });
    expect(failing).toHaveBeenCalledTimes(1);
    await expect(provider.lastAuthorized(request)).rejects.toMatchObject({ uncertain: false });
    expect(failing).toHaveBeenCalledTimes(4);
  });

  it("sends the access ticket only inside Auth, with the issuer CUIT", async () => {
    const bodies: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return new Response(
        soap(
          `<FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><CbteNro>0</CbteNro>` +
            `</FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>`,
        ),
      );
    });
    const provider = createWsfeProvider({
      url: "https://wsfe.invalid/service.asmx",
      timeoutMs: 1000,
      getTicket: async () => ({
        token: "T<1>",
        sign: "S",
        expiresAt: new Date(Date.now() + 3_600_000),
      }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await provider.lastAuthorized(request)).toBe(0);
    expect(bodies[0]).toContain("<ar:Token>T&#60;1&#62;</ar:Token>");
    expect(bodies[0]).toContain("<ar:Cuit>20111111112</ar:Cuit>");
  });
});
