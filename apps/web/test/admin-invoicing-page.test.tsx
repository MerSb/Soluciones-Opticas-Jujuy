import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type {
  FiscalDocumentDetailDto,
  InvoicingStatusDto,
  OnlineInvoiceRequestDto,
} from "@soluciones-opticas/shared";
import { AdminInvoicingPage } from "../src/pages/admin/AdminInvoicingPage";
import { AdminInvoiceDetailPage } from "../src/pages/admin/AdminInvoiceDetailPage";
import { InvoiceDownloadPage } from "../src/pages/InvoiceDownloadPage";
import { AdminOnlineOrdersPage } from "../src/pages/admin/AdminOnlineOrdersPage";
import { renderWithProviders } from "./test-utils";

// Online invoicing admin and the buyer's download (ADR-0036). All fiscal
// data is fictitious (the WSFEv1 manual's sample CUIT 20111111112).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const CATALOG: InvoicingStatusDto["catalog"] = {
  voucherTypes: [
    { code: 1, name: "Factura A", class: "A" },
    { code: 6, name: "Factura B", class: "B" },
    { code: 11, name: "Factura C", class: "C" },
  ],
  receptorConditions: [
    { code: 1, name: "IVA Responsable Inscripto", classes: ["A", "C"] },
    { code: 5, name: "Consumidor Final", classes: ["B", "C"] },
  ],
  documentTypes: [
    { code: 80, name: "CUIT" },
    { code: 96, name: "DNI" },
    { code: 99, name: "Sin identificar" },
  ],
  vatRates: [
    { code: 4, name: "10,5%" },
    { code: 5, name: "21%" },
  ],
};

const ISSUER = {
  id: "i1",
  cuit: "20111111112",
  legalName: "Óptica Ficticia",
  commercialAddress: "Calle Falsa 123",
  grossIncomeNumber: null,
  activityStartDate: null,
  taxConditionCode: null,
  taxConditionConfirmedAt: null,
  finalConsumerIdThreshold: null,
  frameVatRateCode: null,
  lensVatRateCode: null,
  accessoryVatRateCode: null,
  pointsOfSale: [
    { id: "pos1", number: 7, enabledVoucherTypes: [1, 6], active: true, forOnlineSales: true },
  ],
};

function status(overrides: Partial<InvoicingStatusDto> = {}): InvoicingStatusDto {
  return {
    enabled: true,
    environment: "mock",
    emailEnabled: true,
    issuer: ISSUER,
    blockers: [],
    catalog: CATALOG,
    ...overrides,
  };
}

function invoice(overrides: Partial<FiscalDocumentDetailDto> = {}): FiscalDocumentDetailDto {
  return {
    id: "doc1",
    status: "AUTHORIZED",
    environment: "mock",
    orderNumber: "SOJ-000001",
    pointOfSale: 7,
    voucherType: 6,
    voucherName: "Factura B",
    number: 1,
    issueDate: "2026-10-25",
    receptorName: "Cliente Ficticio",
    receptorDocType: 99,
    receptorDocNumber: "0",
    totalAmount: 60500,
    cae: "70000000000001",
    emailStatus: "SENT",
    createdAt: "2026-10-25T12:00:00.000Z",
    caeDueDate: "2026-11-04",
    authorizedAt: "2026-10-25T12:00:01.000Z",
    attempts: 1,
    receptorIvaConditionCode: 5,
    receptorAddress: null,
    untaxedAmount: 0,
    exemptAmount: 0,
    netAmount: 50000,
    vatAmount: 10500,
    otherTaxAmount: 0,
    items: [
      {
        position: 1,
        description: "Armazón Ficticio — Negro",
        quantity: 1,
        unitPrice: 60500,
        vatRateCode: 5,
        grossAmount: 60500,
        netAmount: 50000,
        vatAmount: 10500,
        variantSku: "TEST-001",
      },
    ],
    arcaErrors: [],
    arcaObservations: [],
    email: {
      recipient: "cliente@example.com",
      status: "SENT",
      attempts: 1,
      lastError: null,
      sentAt: "2026-10-25T12:00:02.000Z",
      nextAttemptAt: null,
    },
    events: [],
    ...overrides,
  };
}

const REQUEST: OnlineInvoiceRequestDto = {
  id: "req1",
  orderNumber: "SOJ-000002",
  status: "WAITING_DATA",
  blockerReason: "El comprador indicó CUIT/CUIL: falta su condición frente al IVA.",
  buyerName: "Empresa Ficticia",
  buyerEmail: "compras@example.com",
  billingTaxId: "20111111112",
  total: 60500,
  paymentProvider: "MERCADOPAGO",
  paymentApprovedAt: "2026-10-25T12:00:00.000Z",
  documentId: null,
  createdAt: "2026-10-25T12:00:00.000Z",
};

type Handler = (body: unknown, init?: RequestInit) => unknown;

function stubFetch(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    const handler = routes[`${method} ${path}`];
    if (!handler) throw new Error(`Unhandled request: ${method} ${path}`);
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const result = handler(body, init);
    if (result instanceof Response) return result;
    return {
      ok: true,
      status: 200,
      json: async () => result,
      blob: async () => new Blob(["%PDF-"]),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const callsTo = (fetchMock: ReturnType<typeof stubFetch>, suffix: string) =>
  fetchMock.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith(suffix));

const EMPTY_LIST = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };

describe("AdminInvoicingPage", () => {
  it("is only about online purchases: no manual invoicing, and says what blocks issuing", async () => {
    const user = userEvent.setup();
    stubFetch({
      "GET /api/admin/invoicing/status": () =>
        status({ blockers: ["La condición fiscal del emisor no está confirmada."] }),
      "GET /api/admin/invoicing/invoices": () => EMPTY_LIST,
    });
    renderWithProviders(<AdminInvoicingPage />);
    expect(await screen.findByText(/no está confirmada/)).toBeInTheDocument();
    expect(screen.getByText(/se siguen facturando desde el portal de ARCA/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Nuevo comprobante/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Configuración fiscal" }));
    expect(screen.getByLabelText("Armazones")).toHaveValue("");
  });

  it("lists online invoices with their ARCA and email states, and processes pending ones", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({
      "GET /api/admin/invoicing/status": () => status(),
      "GET /api/admin/invoicing/invoices": () => ({
        data: [invoice({ emailStatus: "FAILED" })],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }),
      "POST /api/admin/invoicing/run": () => ({
        prepared: 0,
        verified: 1,
        emitted: 2,
        failed: 0,
        emailsSent: 3,
        emailsFailed: 0,
      }),
    });
    renderWithProviders(<AdminInvoicingPage />);
    const row = (await screen.findByText("SOJ-000001")).closest("tr")!;
    expect(row).toHaveTextContent("Factura B 00007-00000001");
    expect(row).toHaveTextContent("Autorizado");
    expect(row).toHaveTextContent("Falló");
    await user.click(screen.getByRole("button", { name: "Procesar pendientes" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Emitidas: 2 · Verificadas en ARCA: 1 · Correos enviados: 3",
    );
    expect(callsTo(fetchMock, "/run")).toHaveLength(1);
  });

  it("completes a paid order that waits for the buyer's IVA condition", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({
      "GET /api/admin/invoicing/status": () => status(),
      "GET /api/admin/invoicing/invoices": () => EMPTY_LIST,
      "GET /api/admin/invoicing/requests": () => [REQUEST],
      "POST /api/admin/invoicing/requests/req1/complete": () => ({
        ...REQUEST,
        status: "INVOICED",
      }),
    });
    renderWithProviders(<AdminInvoicingPage />);
    await user.click(await screen.findByRole("tab", { name: "Pedidos por completar" }));
    expect(await screen.findByText(/falta su condición frente al IVA/)).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Condición frente al IVA del comprador"),
      "IVA Responsable Inscripto",
    );
    await user.click(screen.getByRole("button", { name: "Completar y facturar" }));
    const [call] = callsTo(fetchMock, "/complete");
    expect(JSON.parse(call![1]!.body as string)).toEqual({
      receptorIvaConditionCode: 1,
      receptorDocType: 80,
    });
  });

  it("records the fiscal condition only after an explicit confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({
      "GET /api/admin/invoicing/status": () => status(),
      "GET /api/admin/invoicing/invoices": () => EMPTY_LIST,
      "POST /api/admin/invoicing/issuer/tax-condition": () => ISSUER,
    });
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderWithProviders(<AdminInvoicingPage />);
    await user.click(await screen.findByRole("tab", { name: "Configuración fiscal" }));
    await user.selectOptions(
      screen.getByLabelText("Condición confirmada por el contador"),
      "IVA Responsable Inscripto",
    );
    const button = screen.getByRole("button", { name: "Registrar confirmación" });
    await user.click(button);
    expect(callsTo(fetchMock, "/tax-condition")).toHaveLength(0);
    await user.click(button);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(JSON.parse(callsTo(fetchMock, "/tax-condition")[0]![1]!.body as string)).toEqual({
      taxConditionCode: 1,
      confirm: true,
    });
  });
});

function renderDetail() {
  renderWithProviders(
    <Routes>
      <Route path="/admin/invoicing/:id" element={<AdminInvoiceDetailPage />} />
    </Routes>,
    ["/admin/invoicing/doc1"],
  );
}

describe("AdminInvoiceDetailPage", () => {
  it("shows the CAE, the email state, and resends the email without issuing again", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({
      "GET /api/admin/invoicing/invoices/doc1": () => invoice(),
      "POST /api/admin/invoicing/invoices/doc1/resend-email": () => invoice(),
    });
    renderDetail();
    expect(await screen.findByText("70000000000001")).toBeInTheDocument();
    expect(screen.getByText(/Enviado · cliente@example.com/)).toBeInTheDocument();
    expect(screen.getByText("IVA contenido")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Otra dirección (opcional)"), "otro@example.com");
    await user.click(screen.getByRole("button", { name: "Reenviar correo" }));
    expect(JSON.parse(callsTo(fetchMock, "/resend-email")[0]![1]!.body as string)).toEqual({
      recipient: "otro@example.com",
    });
    expect(callsTo(fetchMock, "/emit")).toHaveLength(0);
    expect(screen.getByText("Reenviar no emite otra factura.")).toBeInTheDocument();
  });

  it("an uncertain voucher is only verified, never sent again", async () => {
    stubFetch({
      "GET /api/admin/invoicing/invoices/doc1": () =>
        invoice({ status: "UNCERTAIN", cae: null, email: null, emailStatus: null }),
    });
    renderDetail();
    expect(await screen.findByRole("button", { name: "Verificar en ARCA" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Emitir|Enviar/ })).not.toBeInTheDocument();
    expect(screen.getByText(/No se vuelve a emitir/)).toBeInTheDocument();
  });
});

describe("InvoiceDownloadPage (buyer)", () => {
  function renderBuyer(entry: string) {
    renderWithProviders(
      <Routes>
        <Route path="/factura/:id" element={<InvoiceDownloadPage />} />
      </Routes>,
      [entry],
    );
  }

  it("sends the token from the link's fragment in a header, never in the URL", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
    );
    // jsdom does not navigate: the download click is a no-op here.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchMock = stubFetch({ "GET /api/invoices/doc1/pdf": () => ({}) });
    renderBuyer("/factura/doc1#tokentokentokentokentokentokentokentokento");
    await user.click(await screen.findByRole("button", { name: "Descargar factura (PDF)" }));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain("token");
    expect((init!.headers as Record<string, string>)["X-Invoice-Access-Token"]).toBe(
      "tokentokentokentokentokentokentokentokento",
    );
  });

  it("without a token it explains and offers WhatsApp", async () => {
    stubFetch({});
    renderBuyer("/factura/doc1");
    expect(await screen.findByRole("alert")).toHaveTextContent(/No pudimos encontrar esa factura/);
  });
});

describe("AdminOnlineOrdersPage", () => {
  it("shows payment, invoice and email states side by side, never merged", async () => {
    stubFetch({
      "GET /api/admin/orders": () => ({
        data: [
          {
            orderNumber: "SOJ-000010",
            createdAt: "2026-10-25T12:00:00.000Z",
            buyerName: "Cliente Ficticio",
            buyerEmail: "cliente@example.com",
            grandTotal: 60500,
            orderStatus: "PAID",
            payment: { status: "APPROVED", failureCode: null, provider: "MERCADOPAGO" },
            invoice: {
              requestStatus: "INVOICED",
              blockerReason: null,
              documentId: "doc1",
              documentStatus: "AUTHORIZED",
            },
            emailStatus: "FAILED",
          },
          {
            orderNumber: "SOJ-000011",
            createdAt: "2026-10-25T12:05:00.000Z",
            buyerName: "Otro Cliente",
            buyerEmail: "otro@example.com",
            grandTotal: 1000,
            orderStatus: "PENDING_PAYMENT",
            payment: { status: "PENDING", failureCode: "AMOUNT_MISMATCH", provider: "MERCADOPAGO" },
            invoice: null,
            emailStatus: null,
          },
        ],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      }),
    });
    renderWithProviders(<AdminOnlineOrdersPage />);
    const paid = (await screen.findByText("SOJ-000010")).closest("tr")!;
    expect(paid).toHaveTextContent("Pagado");
    expect(paid).toHaveTextContent("Aprobado");
    expect(paid).toHaveTextContent("Autorizado");
    expect(paid).toHaveTextContent("Falló");
    const pending = screen.getByText("SOJ-000011").closest("tr")!;
    expect(pending).toHaveTextContent("Pago pendiente");
    expect(pending).toHaveTextContent("AMOUNT_MISMATCH");
  });
});
