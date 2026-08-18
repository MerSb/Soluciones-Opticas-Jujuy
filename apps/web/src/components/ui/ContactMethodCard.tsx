import type { ReactNode } from "react";

interface ContactMethodCardProps {
  label: string;
  value: ReactNode;
}

// A method with no value yet still renders — as a clearly pending
// state — rather than silently disappearing, so a visitor understands
// contact options exist even before every channel is confirmed.
export function ContactMethodCard({ label, value }: ContactMethodCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-6 shadow-soft">
      <p className="text-sm font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <div className="mt-2 text-text">{value}</div>
    </div>
  );
}
