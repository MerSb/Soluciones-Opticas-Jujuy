import { Prisma } from "@prisma/client";

// ADR-0028 Phase 2 — business rules confirmed by the client, in one place
// (same pattern as lib/order-policy.ts). Changing the surcharge is a code
// change on purpose until the client asks for it to be editable.

/** Extra paid when the standard (free) cord is replaced by a personalized
 * one. Confirmed: ARS 4,000. */
export const CUSTOM_CORD_SURCHARGE = new Prisma.Decimal(4000);
