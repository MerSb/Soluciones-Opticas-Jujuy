import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";

// The buyer's link to download their invoice again (ADR-0036). The token
// is an HMAC of the voucher id with a key derived from JWT_SECRET (domain
// separated), so it needs no storage and survives email resends; rotating
// JWT_SECRET invalidates every link (documented). The link carries it in
// the URL fragment (#…), which browsers never send to a server, and the
// web page passes it to the API in a header — so it never reaches logs.

const tokenFor = (documentId: string) =>
  createHmac("sha256", env.JWT_SECRET).update(`invoice-download:${documentId}`).digest("base64url");

export function invoiceAccessToken(documentId: string): string {
  return tokenFor(documentId);
}

export function verifyInvoiceAccessToken(documentId: string, token: string): boolean {
  const expected = Buffer.from(tokenFor(documentId));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
