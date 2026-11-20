import type { OrderPaymentStatus, OrderStatus } from "@soluciones-opticas/shared";

// Presentation of order states (Payments V1). The UI never shows an
// enum as-is. No state claims "compra completada" or promises a refund:
// until Mercado Pago exists, an order can only be created and pending.

export type OrderStatusTone = "pending" | "success" | "review" | "neutral";

export interface OrderStatusPresentation {
  label: string;
  description: string;
  tone: OrderStatusTone;
}

const PRESENTATION: Record<OrderStatus, OrderStatusPresentation> = {
  PENDING_PAYMENT: {
    label: "Pago pendiente",
    description: "Tu pedido está reservado temporalmente mientras completás el pago.",
    tone: "pending",
  },
  PAID: {
    label: "Pago confirmado",
    description: "Recibimos tu pago. Te vamos a contactar para coordinar la entrega.",
    tone: "success",
  },
  PAID_NEEDS_REVIEW: {
    label: "Pago recibido — estamos verificando tu pedido",
    description: "Nos comunicaremos con vos si necesitamos confirmar algún detalle.",
    tone: "review",
  },
  EXPIRED: {
    label: "Pedido vencido",
    description:
      "La reserva de este pedido venció antes de completar el pago, así que los productos se liberaron.",
    tone: "neutral",
  },
  CANCELLED: {
    label: "Pedido cancelado",
    description: "Este pedido fue cancelado.",
    tone: "neutral",
  },
};

export function presentOrderStatus(status: OrderStatus): OrderStatusPresentation {
  return PRESENTATION[status];
}

const PAYMENT_LABELS: Record<OrderPaymentStatus, string> = {
  NOT_STARTED: "Sin iniciar",
  PENDING: "En proceso",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reintegrado",
};

export function presentPaymentStatus(status: OrderPaymentStatus): string {
  return PAYMENT_LABELS[status];
}

// Not color alone: every tone also has its own text label and icon glyph.
export const ORDER_STATUS_TONE_CLASS: Record<OrderStatusTone, string> = {
  pending: "border-primary/40 bg-primary/10 text-primary",
  success: "border-success/40 bg-success/10 text-success",
  review: "border-primary/40 bg-primary/5 text-text",
  neutral: "border-border bg-surface-muted text-text-muted",
};
