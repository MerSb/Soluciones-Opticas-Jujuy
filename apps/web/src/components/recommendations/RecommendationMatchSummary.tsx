import type { RecommendationDto } from "@soluciones-opticas/shared";

export const TIER_LABEL: Record<RecommendationDto["tier"], string> = {
  HIGH: "Alta compatibilidad",
  MEDIUM: "Buena compatibilidad",
  LOW: "Compatibilidad parcial",
};

// A 100% score built from a single matching signal (e.g. only a shape
// preference) must never read the same as a 100% built from six —
// `score` alone can't communicate that difference, so this note stands
// in for it (only when evidence isn't already HIGH, to avoid noise on
// the common well-evidenced case). See
// docs/adr/0020-recommendation-engine-v1.md "Coverage / confidence
// semantics".
export const EVIDENCE_NOTE: Partial<Record<RecommendationDto["evidenceLevel"], string>> = {
  LOW: "Basado en poca información de tu perfil.",
  MEDIUM: "Basado en información parcial de tu perfil.",
};

type RecommendationMatchSummaryProps = Pick<
  RecommendationDto,
  "score" | "tier" | "evidenceLevel" | "reasons"
>;

// The score/evidence/reasons block, extracted out of RecommendationCard
// so it can also be reused standalone on Product Detail V2's
// personalized-match section — one place deciding how compatibility is
// worded, so the catalog-wide recommendations list and a single
// product's own page can never describe the same concepts differently.
// Always *compatibilidad*/*preferencias*/*coincidencias*/*perfil* —
// never phrased as a fit guarantee or a medical/diagnostic claim.
export function RecommendationMatchSummary({
  score,
  tier,
  evidenceLevel,
  reasons,
}: RecommendationMatchSummaryProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text">
        {score}%{" "}
        <span className="font-normal text-text-muted">
          compatibilidad con tus preferencias · {TIER_LABEL[tier]}
        </span>
      </p>
      {EVIDENCE_NOTE[evidenceLevel] && (
        <p className="text-xs text-text-muted">{EVIDENCE_NOTE[evidenceLevel]}</p>
      )}
      {reasons.length > 0 && (
        <ul className="space-y-1 text-sm text-text-muted">
          {reasons.map((reason) => (
            <li key={reason.code} className="flex items-start gap-1.5">
              <span aria-hidden="true" className="mt-0.5 text-success">
                ✓
              </span>
              <span>{reason.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
