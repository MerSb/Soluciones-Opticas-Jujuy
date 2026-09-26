import { describe, expect, it } from "vitest";
import {
  classifyRemoteOrder,
  isAccreditedTransaction,
  isClosedWithoutPayment,
  isPaidOrInProgress,
  paymentStatusForRemote,
} from "../../src/lib/mercadopago-status.js";

// The single interpretation of Mercado Pago Orders API states (ADR-0027),
// against the official "Order status" table (consulted 2026-09-26).

describe("classifyRemoteOrder", () => {
  it.each([
    ["processed", "accredited", "APPROVED"],
    ["processed", "partially_refunded", "REVERSED"],
    ["processed", "something_new", "UNKNOWN"],
    ["created", "created", "PENDING_PAYABLE"],
    ["action_required", "waiting_payment", "PENDING_PAYABLE"],
    ["action_required", "waiting_capture", "PENDING_PAYABLE"],
    ["action_required", "waiting_transfer", "PENDING_PAYABLE"],
    ["action_required", "waiting_retry", "PENDING_PAYABLE"],
    ["processing", "in_process", "IN_PROGRESS"],
    ["processing", "pending_review_manual", "IN_PROGRESS"],
    ["in_review", "in_review", "IN_PROGRESS"],
    ["failed", "failed", "FAILED"],
    ["canceled", "canceled", "CANCELLED"],
    ["expired", "expired", "EXPIRED"],
    ["refunded", "refunded", "REVERSED"],
    ["charged_back", "in_process", "REVERSED"],
    ["charged_back", "settled", "REVERSED"],
    ["charged_back", "reimbursed", "REVERSED"],
    ["approved", "accredited", "UNKNOWN"],
    [null, null, "UNKNOWN"],
    ["", "", "UNKNOWN"],
  ])("%s / %s → %s", (status, detail, expected) => {
    expect(classifyRemoteOrder(status, detail)).toBe(expected);
  });

  it("is case/space tolerant but never approves without 'accredited'", () => {
    expect(classifyRemoteOrder(" PROCESSED ", "Accredited")).toBe("APPROVED");
    expect(classifyRemoteOrder("processed", null)).toBe("UNKNOWN");
  });
});

describe("derived rules", () => {
  it("only processed/accredited is an accredited transaction", () => {
    expect(isAccreditedTransaction("processed", "accredited")).toBe(true);
    expect(isAccreditedTransaction("processing", "accredited")).toBe(false);
    expect(isAccreditedTransaction("processed", "partially_refunded")).toBe(false);
  });

  it("maps states to local Payment statuses, leaving the rest untouched", () => {
    expect(paymentStatusForRemote("APPROVED")).toBe("APPROVED");
    expect(paymentStatusForRemote("FAILED")).toBe("REJECTED");
    expect(paymentStatusForRemote("CANCELLED")).toBe("CANCELLED");
    expect(paymentStatusForRemote("EXPIRED")).toBe("CANCELLED");
    for (const state of ["PENDING_PAYABLE", "IN_PROGRESS", "REVERSED", "UNKNOWN"] as const) {
      expect(paymentStatusForRemote(state)).toBeNull();
    }
  });

  it("tells when a new checkout is allowed and when it never is", () => {
    expect(isClosedWithoutPayment("EXPIRED")).toBe(true);
    expect(isClosedWithoutPayment("UNKNOWN")).toBe(false);
    expect(isPaidOrInProgress("IN_PROGRESS")).toBe(true);
    expect(isPaidOrInProgress("REVERSED")).toBe(true);
    expect(isPaidOrInProgress("PENDING_PAYABLE")).toBe(false);
  });
});
