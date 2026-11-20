import { env } from "./env.js";

// PAYMENTS_MODE as one question (lib/runtime-safety.ts checks it at
// startup). Kept out of payment-provider.service.ts so the webhook can ask
// it even where tests replace that service with a fake.
export function isPaymentsEnabled(): boolean {
  return env.PAYMENTS_MODE !== "off";
}
