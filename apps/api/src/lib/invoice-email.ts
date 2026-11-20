// Email boundary for invoice delivery (ADR-0036). No email provider is
// chosen yet (SMTP, Resend, SES…): that is a pending decision, so the only
// implementation is the mock used in tests and local runs. The real
// adapter implements the same interface.

export interface InvoiceEmailMessage {
  to: string;
  subject: string;
  text: string;
  attachment: { filename: string; content: Buffer; contentType: "application/pdf" };
}

export interface InvoiceEmailProvider {
  readonly code: string;
  /** Resolves with the provider's message id; throws on failure. */
  send(message: InvoiceEmailMessage): Promise<string>;
}

/** Thrown by an adapter; `message` is safe to store (no credentials). */
export class InvoiceEmailError extends Error {}

export function createMockInvoiceEmailProvider() {
  const sent: InvoiceEmailMessage[] = [];
  let failures = 0;
  const provider: InvoiceEmailProvider & {
    sent: InvoiceEmailMessage[];
    failNext(times?: number): void;
    reset(): void;
  } = {
    code: "mock",
    sent,
    async send(message) {
      if (failures > 0) {
        failures -= 1;
        throw new InvoiceEmailError("Servidor de correo simulado no disponible.");
      }
      sent.push(message);
      return `mock-${sent.length}`;
    },
    failNext(times = 1) {
      failures += times;
    },
    reset() {
      sent.length = 0;
      failures = 0;
    },
  };
  return provider;
}
