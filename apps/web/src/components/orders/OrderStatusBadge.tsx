import type { OrderStatus } from "@soluciones-opticas/shared";
import { ORDER_STATUS_TONE_CLASS, presentOrderStatus } from "../../lib/order-status";

const GLYPH = { pending: "◷", success: "✓", review: "◔", neutral: "•" } as const;

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const presentation = presentOrderStatus(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${ORDER_STATUS_TONE_CLASS[presentation.tone]}`}
    >
      <span aria-hidden="true">{GLYPH[presentation.tone]}</span>
      {presentation.label}
    </span>
  );
}
