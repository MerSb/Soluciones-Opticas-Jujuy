import type { ColorTone } from "@soluciones-opticas/shared";
import { tonesBackground } from "../../lib/color-tones";

/** A palette swatch: one tone fills it, a two-tone piece is split in halves. */
export function ColorToneDot({
  tones,
  className = "h-4 w-4",
}: {
  tones: readonly ColorTone[];
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full border border-border ${className}`}
      style={{ background: tonesBackground(tones) }}
    />
  );
}
