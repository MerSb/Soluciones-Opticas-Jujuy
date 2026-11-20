import {
  InvoicingProviderError,
  type AuthorizeResult,
  type ConsultedVoucher,
  type InvoicingProvider,
  type VoucherKey,
  type VoucherRequest,
} from "../invoicing-provider.js";

// Simulated ARCA for tests and local use (ADR-0036): keeps its own
// numbering per CUIT/point of sale/type in memory and applies the
// correlativity rule of FECAESolicitar (error 10016). CAEs are fictitious
// and every PDF made with this provider says «SIMULADO — SIN VALIDEZ
// FISCAL». `injectFault` lets tests reproduce lost answers.

export type MockFault =
  /** ARCA authorizes, but the answer never arrives. */
  | "TIMEOUT_AFTER_AUTHORIZING"
  /** The request never reaches ARCA. */
  | "TIMEOUT_BEFORE_REACHING"
  /** ARCA rejects the voucher (validation error). */
  | "REJECT"
  /** The next consult fails with a network error. */
  | "CONSULT_DOWN";

const keyOf = (key: VoucherKey) => `${key.issuerCuit}/${key.pointOfSale}/${key.voucherType}`;

export function createMockInvoicingProvider() {
  const issued = new Map<string, ConsultedVoucher[]>();
  const faults: MockFault[] = [];
  let caeCounter = 0;
  let latencyMs = 0;
  const wait = () => (latencyMs ? new Promise((resolve) => setTimeout(resolve, latencyMs)) : null);

  const vouchers = (key: VoucherKey) => issued.get(keyOf(key)) ?? [];

  const provider: InvoicingProvider & {
    injectFault(fault: MockFault): void;
    /** Delay of every call, to reproduce concurrent emissions. */
    setLatency(ms: number): void;
    reset(): void;
    /** Records a voucher as issued elsewhere (e.g. another system). */
    seedIssued(key: VoucherKey, voucher: ConsultedVoucher): void;
  } = {
    environment: "mock",

    async lastAuthorized(key) {
      await wait();
      return vouchers(key).reduce((max, voucher) => Math.max(max, voucher.number), 0);
    },

    async authorize(request: VoucherRequest): Promise<AuthorizeResult> {
      await wait();
      const fault = faults.shift();
      if (fault === "TIMEOUT_BEFORE_REACHING") {
        throw new InvoicingProviderError("Tiempo de espera agotado.", { uncertain: true });
      }
      if (fault === "REJECT") {
        return {
          outcome: "REJECTED",
          errors: [{ code: 10015, message: "Rechazo simulado." }],
          observations: [],
        };
      }
      const last = await provider.lastAuthorized(request);
      if (request.number !== last + 1) {
        return {
          outcome: "REJECTED",
          errors: [
            {
              code: 10016,
              message: "El número de comprobante debe ser el siguiente al último autorizado.",
            },
          ],
          observations: [],
        };
      }
      caeCounter += 1;
      const cae = `7${String(caeCounter).padStart(13, "0")}`;
      const dueDate = addDays(request.issueDate, 10);
      const list = vouchers(request);
      list.push({
        number: request.number,
        docType: request.docType,
        docNumber: request.docNumber,
        issueDate: request.issueDate,
        total: request.total,
        result: "A",
        authorizationCode: cae,
        emissionType: "CAE",
        dueDate,
      });
      issued.set(keyOf(request), list);
      if (fault === "TIMEOUT_AFTER_AUTHORIZING") {
        throw new InvoicingProviderError("Tiempo de espera agotado.", { uncertain: true });
      }
      return { outcome: "AUTHORIZED", cae, caeDueDate: dueDate, observations: [] };
    },

    async consult(key, number) {
      if (faults[0] === "CONSULT_DOWN") {
        faults.shift();
        throw new InvoicingProviderError("ARCA no responde.", { uncertain: false });
      }
      return vouchers(key).find((voucher) => voucher.number === number) ?? null;
    },

    injectFault(fault) {
      faults.push(fault);
    },
    setLatency(ms) {
      latencyMs = ms;
    },
    reset() {
      issued.clear();
      faults.length = 0;
      latencyMs = 0;
    },
    seedIssued(key, voucher) {
      issued.set(keyOf(key), [...vouchers(key), voucher]);
    },
  };
  return provider;
}

function addDays(yyyymmdd: string, days: number): string {
  const date = new Date(
    Date.UTC(
      Number(yyyymmdd.slice(0, 4)),
      Number(yyyymmdd.slice(4, 6)) - 1,
      Number(yyyymmdd.slice(6, 8)),
    ),
  );
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}
