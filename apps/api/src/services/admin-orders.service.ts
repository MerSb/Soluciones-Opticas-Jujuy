import type { AdminOnlineOrderDto } from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";

// Online orders for the admin (ADR-0036), read-only: payment, invoice and
// email each keep their own state, so a problem in one never hides behind
// another. Contact data shown is what the buyer gave for that order.

export async function listOnlineOrders(page: number, limit: number) {
  const [total, orders] = await Promise.all([
    prisma.order.count(),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  ]);
  const requests = await prisma.onlineInvoiceRequest.findMany({
    where: { orderId: { in: orders.map((order) => order.id) } },
    include: { sale: { include: { document: { include: { email: true } } } } },
  });
  const byOrder = new Map(requests.map((request) => [request.orderId, request]));
  const data: AdminOnlineOrderDto[] = orders.map((order) => {
    const payment = order.payments[0] ?? null;
    const request = byOrder.get(order.id) ?? null;
    const document = request?.sale?.document ?? null;
    return {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      buyerName: `${order.customerFirstName} ${order.customerLastName}`.trim(),
      buyerEmail: order.customerEmail,
      grandTotal: order.grandTotal.toNumber(),
      orderStatus: order.status,
      payment: payment
        ? { status: payment.status, failureCode: payment.failureCode, provider: payment.provider }
        : null,
      invoice: request
        ? {
            requestStatus: request.status,
            blockerReason: request.blockerReason,
            documentId: document?.id ?? null,
            documentStatus: document?.status ?? null,
          }
        : null,
      emailStatus: document?.email?.status ?? null,
    };
  });
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
