import type { ReactNode } from "react";

interface AdminMetricCardProps {
  label: string;
  value: number | string;
  helperText?: string;
  icon?: ReactNode;
  /** Renders a skeleton in place of the value — same card chrome, so the
   * grid doesn't reflow once the real number arrives. */
  isLoading?: boolean;
}

// One reusable card, not six hardcoded ones (Admin Dashboard V2 §7) —
// every KPI on /admin is this same shape with different label/value/
// icon. Same visual language as ContactMethodCard (rounded-lg border
// bg-surface-muted shadow-soft) so the admin area doesn't invent a
// second card style next to the public site's.
export function AdminMetricCard({
  label,
  value,
  helperText,
  icon,
  isLoading,
}: AdminMetricCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-text-muted">{label}</p>
        {icon && (
          <span aria-hidden="true" className="text-text-muted">
            {icon}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="mt-2 h-8 w-16 animate-pulse rounded bg-surface-sunken" aria-hidden="true" />
      ) : (
        <p className="mt-2 font-display text-3xl font-semibold text-text">{value}</p>
      )}

      {helperText && !isLoading && <p className="mt-1 text-xs text-text-muted">{helperText}</p>}
    </div>
  );
}
